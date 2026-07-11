import type {
  VedabaseClientMutation,
  VedabaseSyncPullResponse,
  VedabaseSyncPushResponse,
} from "@vedamatch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteVedabaseDb, openVedabaseDb } from "./local-db";
import { VedabaseSyncEngine } from "./sync-engine";

const userIds = new Set<string>();

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([...userIds].map((userId) => deleteVedabaseDb(userId)));
  userIds.clear();
});

describe("VedabaseSyncEngine", () => {
  it("keeps offline mutations queued without blocking local writes", async () => {
    const userId = trackUser("offline-user");
    const push = vi.fn();
    const engine = createEngine(userId, { online: () => false, push });

    await engine.enqueue(mutation("second", "2026-07-10T12:01:00.000Z"));

    const database = await openVedabaseDb(userId);
    await expect(database.getAll("mutationQueue")).resolves.toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ state: "pending", pendingCount: 1 });
    engine.dispose();
  });

  it("pushes queued mutations in creation order and removes accepted entries", async () => {
    const userId = trackUser("ordered-user");
    const push = vi.fn().mockResolvedValue({
      accepted: [
        { clientMutationId: "first", revision: 2 },
        { clientMutationId: "second", revision: 3 },
      ],
      cursor: "push-cursor",
    } satisfies VedabaseSyncPushResponse);
    const engine = createEngine(userId, { push });
    const database = await openVedabaseDb(userId);
    await database.put("progress", {
      bookSlug: "book-1",
      payload: { bookSlug: "book-1", percentage: 10 },
      revision: null,
    });
    await database.put("mutationQueue", mutation("second", "2026-07-10T12:01:00.000Z"));
    await database.put("mutationQueue", mutation("first", "2026-07-10T12:00:00.000Z"));

    await engine.flush();

    expect(
      push.mock.calls[0]?.[0].mutations.map(
        (item: VedabaseClientMutation) => item.clientMutationId,
      ),
    ).toEqual([
      "first",
      "second",
    ]);
    await expect(database.getAll("mutationQueue")).resolves.toEqual([]);
    await expect(database.get("progress", "book-1")).resolves.toMatchObject({ revision: 3 });
    expect(engine.getSnapshot()).toMatchObject({ state: "synced", pendingCount: 0 });
    engine.dispose();
  });

  it("retains unaccepted mutations and accepts duplicate server responses once", async () => {
    const userId = trackUser("duplicate-user");
    const push = vi.fn().mockResolvedValue({
      accepted: [
        { clientMutationId: "first", revision: 4 },
        { clientMutationId: "first", revision: 4 },
      ],
      cursor: "push-cursor",
    } satisfies VedabaseSyncPushResponse);
    const engine = createEngine(userId, { push });
    const database = await openVedabaseDb(userId);
    await database.put("mutationQueue", mutation("first", "2026-07-10T12:00:00.000Z"));
    await database.put("mutationQueue", mutation("second", "2026-07-10T12:01:00.000Z"));

    await engine.flush();

    await expect(database.getAllKeys("mutationQueue")).resolves.toEqual(["second"]);
    expect(engine.getSnapshot()).toMatchObject({ state: "pending", pendingCount: 1 });
    engine.dispose();
  });

  it("applies pulled changes and persists the pull cursor", async () => {
    const userId = trackUser("pull-user");
    const pull = vi.fn().mockResolvedValue({
      changes: [
        {
          entity: "bookmark",
          entityId: "bookmark-1",
          revision: 7,
          payload: { bookSlug: "book-1", deletedAt: null },
        },
      ],
      cursor: "cursor-7",
    } satisfies VedabaseSyncPullResponse);
    const engine = createEngine(userId, { pull });

    await engine.pull();

    const database = await openVedabaseDb(userId);
    await expect(database.get("bookmarks", "bookmark-1")).resolves.toMatchObject({ revision: 7 });
    await expect(database.get("syncMeta", "cursor")).resolves.toEqual({
      key: "cursor",
      value: "cursor-7",
    });
    await engine.pull();
    expect(pull).toHaveBeenLastCalledWith("cursor-7", undefined);
    engine.dispose();
  });

  it("backs off failed flushes and flushes when the browser comes online", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const userId = trackUser("retry-user");
    const events = new EventTarget();
    let online = true;
    const push = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({
        accepted: [{ clientMutationId: "first", revision: 2 }],
        cursor: "push-cursor",
      } satisfies VedabaseSyncPushResponse);
    const engine = createEngine(userId, {
      eventTarget: events,
      online: () => online,
      push,
      retryBaseMs: 1_000,
    });
    const database = await openVedabaseDb(userId);
    await database.put("mutationQueue", mutation("first", "2026-07-10T12:00:00.000Z"));

    await engine.flush();
    expect(engine.getSnapshot().state).toBe("error");
    expect(push).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(push).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await engine.flush();
    expect(push).toHaveBeenCalledTimes(2);

    await database.put("mutationQueue", mutation("second", "2026-07-10T12:01:00.000Z"));
    online = false;
    await engine.start();
    online = true;
    events.dispatchEvent(new Event("online"));
    await engine.flush();
    expect(push).toHaveBeenCalledTimes(3);
    engine.dispose();
  });
});

function createEngine(
  userId: string,
  overrides: Partial<ConstructorParameters<typeof VedabaseSyncEngine>[1]> = {},
) {
  return new VedabaseSyncEngine(userId, {
    debounceMs: 0,
    push: vi.fn().mockResolvedValue({ accepted: [], cursor: "" }),
    pull: vi.fn().mockResolvedValue({ changes: [], cursor: "" }),
    ...overrides,
  });
}

function mutation(clientMutationId: string, createdAt: string): VedabaseClientMutation {
  return {
    clientMutationId,
    entity: "progress",
    entityId: "book-1",
    baseRevision: null,
    payload: { bookSlug: "book-1", percentage: 10 },
    createdAt,
  };
}

function trackUser(userId: string): string {
  userIds.add(userId);
  return userId;
}
