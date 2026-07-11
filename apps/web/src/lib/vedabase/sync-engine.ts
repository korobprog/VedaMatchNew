import type {
  VedabaseClientMutation,
  VedabaseMutationEntity,
  VedabaseSyncPullResponse,
  VedabaseSyncPushRequest,
  VedabaseSyncPushResponse,
} from "@vedamatch/shared";
import type { IDBPTransaction } from "idb";
import { pullVedabaseChanges, pushVedabaseMutations } from "../vedabase-client-api";
import {
  openVedabaseDb,
  type VedabaseDb,
  type VedabaseDbSchema,
} from "./local-db";

const syncCursorKey = "cursor";
const maximumBatchSize = 100;
const maximumRetryMs = 30_000;

export type VedabaseSyncState = "local" | "pending" | "synced" | "error";

export interface VedabaseSyncSnapshot {
  state: VedabaseSyncState;
  pendingCount: number;
  error: string | null;
}

export interface VedabaseSyncEngineOptions {
  push?: (
    request: VedabaseSyncPushRequest,
    signal?: AbortSignal,
  ) => Promise<VedabaseSyncPushResponse>;
  pull?: (
    after?: string,
    signal?: AbortSignal,
  ) => Promise<VedabaseSyncPullResponse>;
  online?: () => boolean;
  eventTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  debounceMs?: number;
  retryBaseMs?: number;
}

export class VedabaseSyncEngine {
  private readonly database: Promise<VedabaseDb>;
  private readonly pushRequest;
  private readonly pullRequest;
  private readonly online;
  private readonly eventTarget;
  private readonly debounceMs;
  private readonly retryBaseMs;
  private readonly listeners = new Set<() => void>();
  private snapshot: VedabaseSyncSnapshot = {
    state: "local",
    pendingCount: 0,
    error: null,
  };
  private flushPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private started = false;
  private disposed = false;

  constructor(userId: string, options: VedabaseSyncEngineOptions = {}) {
    this.database = openVedabaseDb(userId);
    this.pushRequest = options.push ?? pushVedabaseMutations;
    this.pullRequest = options.pull ?? pullVedabaseChanges;
    this.online = options.online ?? (() => typeof navigator === "undefined" || navigator.onLine);
    this.eventTarget = options.eventTarget ?? (typeof window === "undefined" ? undefined : window);
    this.debounceMs = options.debounceMs ?? 350;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): VedabaseSyncSnapshot => this.snapshot;

  async start(): Promise<void> {
    if (this.disposed) return;
    if (!this.started) {
      this.started = true;
      this.eventTarget?.addEventListener("online", this.handleOnline);
    }
    await this.refreshPendingState();
    if (this.online()) await this.flush();
  }

  async enqueue(mutation: VedabaseClientMutation): Promise<void> {
    const database = await this.database;
    await database.put("mutationQueue", mutation);
    await this.refreshPendingState();
    if (this.online()) this.schedule(this.debounceMs);
  }

  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.flushPromise) return this.flushPromise;
    this.clearTimer();
    this.flushPromise = this.performFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  async pull(signal?: AbortSignal): Promise<void> {
    const database = await this.database;
    const cursorRecord = await database.get("syncMeta", syncCursorKey);
    const cursor = typeof cursorRecord?.value === "string" ? cursorRecord.value : undefined;
    const response = await this.pullRequest(cursor || undefined, signal);
    const transaction = database.transaction(
      ["progress", "bookmarks", "annotations", "syncMeta"],
      "readwrite",
    );
    for (const change of response.changes) {
      await applyRemoteChange(transaction, change);
    }
    await transaction.objectStore("syncMeta").put({
      key: syncCursorKey,
      value: response.cursor,
    });
    await transaction.done;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.eventTarget?.removeEventListener("online", this.handleOnline);
    this.listeners.clear();
    void this.database.then((database) => database.close());
  }

  private async performFlush(): Promise<void> {
    const database = await this.database;
    const queued = sortMutations(await database.getAll("mutationQueue"));
    if (!this.online()) {
      this.update({
        state: queued.length > 0 ? "pending" : "local",
        pendingCount: queued.length,
        error: null,
      });
      return;
    }

    try {
      for (let offset = 0; offset < queued.length; offset += maximumBatchSize) {
        const batch = queued.slice(offset, offset + maximumBatchSize);
        const response = await this.pushRequest({ mutations: batch });
        await acceptMutations(database, batch, response);
      }
      await this.pull();
      this.retryAttempt = 0;
      await this.refreshPendingState(true);
    } catch (error) {
      const pendingCount = (await database.getAllKeys("mutationQueue")).length;
      this.update({
        state: "error",
        pendingCount,
        error: errorMessage(error),
      });
      this.scheduleRetry();
    }
  }

  private async refreshPendingState(synced = false): Promise<void> {
    const pendingCount = (await (await this.database).getAllKeys("mutationQueue")).length;
    this.update({
      state: pendingCount > 0 ? "pending" : synced ? "synced" : "local",
      pendingCount,
      error: null,
    });
  }

  private schedule(delay: number): void {
    if (this.disposed) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private scheduleRetry(): void {
    const delay = Math.min(
      this.retryBaseMs * 2 ** this.retryAttempt,
      maximumRetryMs,
    );
    this.retryAttempt += 1;
    this.schedule(delay);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private update(snapshot: VedabaseSyncSnapshot): void {
    if (
      snapshot.state === this.snapshot.state &&
      snapshot.pendingCount === this.snapshot.pendingCount &&
      snapshot.error === this.snapshot.error
    ) {
      return;
    }
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private readonly handleOnline = (): void => {
    this.retryAttempt = 0;
    void this.flush();
  };
}

function sortMutations(mutations: VedabaseClientMutation[]): VedabaseClientMutation[] {
  return [...mutations].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.clientMutationId.localeCompare(right.clientMutationId),
  );
}

async function acceptMutations(
  database: VedabaseDb,
  batch: VedabaseClientMutation[],
  response: VedabaseSyncPushResponse,
): Promise<void> {
  const accepted = new Map(
    response.accepted.map((item) => [item.clientMutationId, item.revision]),
  );
  const byId = new Map(batch.map((mutation) => [mutation.clientMutationId, mutation]));
  const transaction = database.transaction(
    ["progress", "bookmarks", "annotations", "mutationQueue"],
    "readwrite",
  );
  for (const [clientMutationId, revision] of accepted) {
    const mutation = byId.get(clientMutationId);
    if (!mutation) continue;
    await updateLocalRevision(transaction, mutation.entity, mutation.entityId, revision);
    await transaction.objectStore("mutationQueue").delete(clientMutationId);
  }
  await transaction.done;
}

type SyncStore = "progress" | "bookmarks" | "annotations" | "mutationQueue" | "syncMeta";
type SyncTransaction = IDBPTransaction<
  VedabaseDbSchema,
  SyncStore[],
  "readwrite"
>;

async function updateLocalRevision(
  transaction: SyncTransaction,
  entity: VedabaseMutationEntity,
  entityId: string,
  revision: number,
): Promise<void> {
  if (entity === "progress") {
    const store = transaction.objectStore("progress");
    const record = await store.get(entityId);
    if (record) await store.put({ ...record, revision });
    return;
  }
  if (entity === "bookmark") {
    const store = transaction.objectStore("bookmarks");
    const record = await store.get(entityId);
    if (record) await store.put({ ...record, revision });
    return;
  }
  const store = transaction.objectStore("annotations");
  const record = await store.get(entityId);
  if (record) await store.put({ ...record, revision });
}

async function applyRemoteChange(
  transaction: SyncTransaction,
  change: VedabaseSyncPullResponse["changes"][number],
): Promise<void> {
  const bookSlug = payloadBookSlug(change.payload) ?? change.entityId;
  if (change.entity === "progress") {
    const store = transaction.objectStore("progress");
    const current = await store.get(change.entityId);
    if ((current?.revision ?? -1) <= change.revision) {
      await store.put({ bookSlug: change.entityId, payload: change.payload, revision: change.revision });
    }
    return;
  }
  if (change.entity === "bookmark") {
    const store = transaction.objectStore("bookmarks");
    const current = await store.get(change.entityId);
    if ((current?.revision ?? -1) <= change.revision) {
      await store.put({ id: change.entityId, bookSlug, payload: change.payload, revision: change.revision });
    }
    return;
  }
  const store = transaction.objectStore("annotations");
  const current = await store.get(change.entityId);
  if ((current?.revision ?? -1) <= change.revision) {
    await store.put({ id: change.entityId, bookSlug, payload: change.payload, revision: change.revision });
  }
}

function payloadBookSlug(payload: unknown): string | null {
  return payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).bookSlug === "string"
    ? ((payload as Record<string, unknown>).bookSlug as string)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Vedabase synchronization failed";
}
