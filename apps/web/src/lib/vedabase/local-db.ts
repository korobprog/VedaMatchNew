import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  VedabaseBookManifest,
  VedabaseClientMutation,
  VedabasePackageFile,
} from "@vedamatch/shared";

const databasePrefix = "vedabase:";
const databaseVersion = 1;
const activeConnections = new Map<string, Set<IDBPDatabase<VedabaseDbSchema>>>();

export interface VedabaseLibraryBook {
  bookSlug: string;
  activeVersion: string;
  manifest: VedabaseBookManifest;
  activatedAt: string;
}

export interface VedabaseBookVersionRecord {
  key: string;
  bookSlug: string;
  version: string;
  manifest: VedabaseBookManifest;
  status: "staged" | "active" | "inactive";
  stagedAt: string;
  activatedAt: string | null;
}

export interface VedabaseStoredFile {
  key: string;
  bookVersionKey: string;
  bookSlug: string;
  version: string;
  path: string;
  metadata: VedabasePackageFile;
  body: ArrayBuffer;
  verified: true;
  stagedAt: string;
}

export interface VedabaseDownloadState {
  bookSlug: string;
  version: string;
  status: "idle" | "downloading" | "paused" | "error" | "complete";
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

export interface VedabasePreferenceRecord {
  key: string;
  value: unknown;
}

export interface VedabaseLocalProgress {
  bookSlug: string;
  payload: unknown;
  revision: number | null;
}

export interface VedabaseLocalBookmark {
  id: string;
  bookSlug: string;
  payload: unknown;
  revision: number | null;
}

export interface VedabaseLocalAnnotation {
  id: string;
  bookSlug: string;
  payload: unknown;
  revision: number | null;
}

export interface VedabaseSyncMetaRecord {
  key: string;
  value: unknown;
}

export interface VedabaseDbSchema extends DBSchema {
  library: {
    key: string;
    value: VedabaseLibraryBook;
  };
  bookVersions: {
    key: string;
    value: VedabaseBookVersionRecord;
  };
  files: {
    key: string;
    value: VedabaseStoredFile;
  };
  downloadState: {
    key: string;
    value: VedabaseDownloadState;
  };
  preferences: {
    key: string;
    value: VedabasePreferenceRecord;
  };
  progress: {
    key: string;
    value: VedabaseLocalProgress;
  };
  bookmarks: {
    key: string;
    value: VedabaseLocalBookmark;
  };
  annotations: {
    key: string;
    value: VedabaseLocalAnnotation;
  };
  mutationQueue: {
    key: string;
    value: VedabaseClientMutation;
  };
  syncMeta: {
    key: string;
    value: VedabaseSyncMetaRecord;
  };
}

export type VedabaseDb = IDBPDatabase<VedabaseDbSchema>;

export function vedabaseDatabaseName(userId: string): string {
  if (userId.trim().length === 0) {
    throw new Error("A user ID is required to open Vedabase storage");
  }

  return `${databasePrefix}${userId}`;
}

export function vedabaseBookVersionKey(
  bookSlug: string,
  version: string,
): string {
  return JSON.stringify([bookSlug, version]);
}

export function vedabaseFileKey(
  bookSlug: string,
  version: string,
  path: string,
): string {
  return JSON.stringify([bookSlug, version, path]);
}

export async function openVedabaseDb(userId: string): Promise<VedabaseDb> {
  const name = vedabaseDatabaseName(userId);
  const database = await openDB<VedabaseDbSchema>(name, databaseVersion, {
    upgrade(db) {
      db.createObjectStore("library", { keyPath: "bookSlug" });
      db.createObjectStore("bookVersions", { keyPath: "key" });
      db.createObjectStore("files", { keyPath: "key" });
      db.createObjectStore("downloadState", { keyPath: "bookSlug" });
      db.createObjectStore("preferences", { keyPath: "key" });
      db.createObjectStore("progress", { keyPath: "bookSlug" });
      db.createObjectStore("bookmarks", { keyPath: "id" });
      db.createObjectStore("annotations", { keyPath: "id" });
      db.createObjectStore("mutationQueue", { keyPath: "clientMutationId" });
      db.createObjectStore("syncMeta", { keyPath: "key" });
    },
    blocking() {
      database.close();
      activeConnections.get(name)?.delete(database);
    },
    terminated() {
      activeConnections.get(name)?.delete(database);
    },
  });

  const connections = activeConnections.get(name) ?? new Set<VedabaseDb>();
  connections.add(database);
  activeConnections.set(name, connections);
  return database;
}

export async function deleteVedabaseDb(userId: string): Promise<void> {
  const name = vedabaseDatabaseName(userId);
  const connections = activeConnections.get(name);
  connections?.forEach((database) => database.close());
  activeConnections.delete(name);
  await deleteDB(name);
}
