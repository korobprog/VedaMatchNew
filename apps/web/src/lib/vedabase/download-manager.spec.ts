import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  VedabaseBookManifest,
  VedabaseLibraryManifest,
  VedabasePackageFile,
} from "@vedamatch/shared";
import { VedabaseDownloadManager, VedabaseQuotaError } from "./download-manager";
import { deleteVedabaseDb, openVedabaseDb } from "./local-db";
import { sha256Hex } from "./package-validator";

const userIds = new Set<string>();

afterEach(async () => {
  await Promise.all([...userIds].map((userId) => deleteVedabaseDb(userId)));
  userIds.clear();
});

async function bookFixture(slug = "book-1", version = "version-1") {
  const bodies = new Map<string, Blob>([
    ["chapters/one.json", new Blob(["first"], { type: "application/json" })],
    ["chapters/two.json", new Blob(["second!"], { type: "application/json" })],
  ]);
  const files: VedabasePackageFile[] = [];
  for (const [path, body] of bodies) {
    files.push({
      path,
      bytes: body.size,
      sha256: await sha256Hex(body),
      contentType: "application/json",
    });
  }
  const manifest: VedabaseBookManifest = {
    formatVersion: 1,
    slug,
    title: `Book ${slug}`,
    author: null,
    language: "ru",
    contentVersion: version,
    packageChecksum: "a".repeat(64),
    sizeBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    coverPath: null,
    sourceUrl: `https://vedabase.ru/${slug}`,
    sourceOrigin: "https://vedabase.ru",
    importedAt: "2026-07-10T00:00:00.000Z",
    permissionRef: "permission",
    attribution: "vedabase.ru",
    chapters: [],
    files,
  };

  return { bodies, manifest };
}

function trackUser(userId: string) {
  userIds.add(userId);
  return userId;
}

function roomyStorage() {
  return {
    estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }),
    persist: vi.fn().mockResolvedValue(true),
  };
}

describe("VedabaseDownloadManager", () => {
  it("downloads one book sequentially and persists real byte progress", async () => {
    const userId = trackUser("download-one");
    const fixture = await bookFixture();
    const calls: string[] = [];
    const storageManager = roomyStorage();
    const manager = new VedabaseDownloadManager(userId, {
      fetchManifest: vi.fn().mockResolvedValue(fixture.manifest),
      fetchFile: vi.fn(async (_slug, _version, path) => {
        calls.push(path);
        return fixture.bodies.get(path)!;
      }),
      storageManager,
    });

    await manager.downloadBook(fixture.manifest.slug);

    expect(calls).toEqual(fixture.manifest.files.map((file) => file.path));
    expect(manager.getSnapshot().downloads[fixture.manifest.slug]).toMatchObject({
      status: "complete",
      downloadedBytes: fixture.manifest.sizeBytes,
      totalBytes: fixture.manifest.sizeBytes,
    });
    expect(storageManager.persist).toHaveBeenCalledTimes(1);
    const db = await openVedabaseDb(userId);
    await expect(db.get("library", fixture.manifest.slug)).resolves.toMatchObject({
      activeVersion: fixture.manifest.contentVersion,
    });
  });

  it("downloads a library one book at a time", async () => {
    const userId = trackUser("download-library");
    const first = await bookFixture("book-1");
    const second = await bookFixture("book-2");
    const manifests = new Map([
      [first.manifest.slug, first],
      [second.manifest.slug, second],
    ]);
    const calls: string[] = [];
    const manager = new VedabaseDownloadManager(userId, {
      fetchManifest: vi.fn(async (slug) => manifests.get(slug)!.manifest),
      fetchFile: vi.fn(async (slug, _version, path) => {
        calls.push(`${slug}:${path}`);
        return manifests.get(slug)!.bodies.get(path)!;
      }),
      storageManager: roomyStorage(),
    });
    const library: VedabaseLibraryManifest = {
      formatVersion: 1,
      generatedAt: "2026-07-10T00:00:00.000Z",
      books: [first.manifest, second.manifest],
    };

    await manager.downloadLibrary(library);

    expect(calls).toEqual([
      "book-1:chapters/one.json",
      "book-1:chapters/two.json",
      "book-2:chapters/one.json",
      "book-2:chapters/two.json",
    ]);
    expect(manager.getSnapshot().libraryDownload).toMatchObject({
      totalBooks: 2,
      completedBooks: 2,
      currentBookSlug: null,
    });
  });

  it("pauses without losing verified files and resumes at the missing file", async () => {
    const userId = trackUser("download-resume");
    const fixture = await bookFixture();
    const calls: string[] = [];
    let secondAttempt = 0;
    const manager = new VedabaseDownloadManager(userId, {
      fetchManifest: vi.fn().mockResolvedValue(fixture.manifest),
      fetchFile: vi.fn(async (_slug, _version, path, signal) => {
        calls.push(path);
        if (path === "chapters/one.json") {
          return fixture.bodies.get(path)!;
        }
        secondAttempt += 1;
        if (secondAttempt === 1) {
          return new Promise<Blob>((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Paused", "AbortError")),
            );
          });
        }
        return fixture.bodies.get(path)!;
      }),
      storageManager: roomyStorage(),
    });

    const download = manager.downloadBook(fixture.manifest.slug);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    manager.pauseBook(fixture.manifest.slug);
    await download;

    expect(manager.getSnapshot().downloads[fixture.manifest.slug]?.status).toBe(
      "paused",
    );
    const db = await openVedabaseDb(userId);
    await expect(db.getAll("files")).resolves.toHaveLength(1);

    await manager.resumeBook(fixture.manifest.slug);

    expect(calls).toEqual([
      "chapters/one.json",
      "chapters/two.json",
      "chapters/two.json",
    ]);
    expect(manager.getSnapshot().downloads[fixture.manifest.slug]?.status).toBe(
      "complete",
    );
  });

  it("reports insufficient quota before downloading package files", async () => {
    const userId = trackUser("download-quota");
    const fixture = await bookFixture();
    const fetchFile = vi.fn();
    const manager = new VedabaseDownloadManager(userId, {
      fetchManifest: vi.fn().mockResolvedValue(fixture.manifest),
      fetchFile,
      storageManager: {
        estimate: vi.fn().mockResolvedValue({ quota: 10, usage: 9 }),
        persist: vi.fn(),
      },
    });

    await expect(manager.downloadBook(fixture.manifest.slug)).rejects.toThrow(
      VedabaseQuotaError,
    );
    expect(fetchFile).not.toHaveBeenCalled();
    expect(manager.getSnapshot().downloads[fixture.manifest.slug]?.status).toBe(
      "error",
    );
  });

  it("retries a checksum failure and activates only after every file verifies", async () => {
    const userId = trackUser("download-checksum");
    const fixture = await bookFixture();
    const secondFile = deferred<Blob>();
    let firstAttempts = 0;
    const manager = new VedabaseDownloadManager(userId, {
      fetchManifest: vi.fn().mockResolvedValue(fixture.manifest),
      fetchFile: vi.fn(async (_slug, _version, path) => {
        if (path === "chapters/one.json") {
          firstAttempts += 1;
          return firstAttempts === 1
            ? new Blob(["wrong"], { type: "application/json" })
            : fixture.bodies.get(path)!;
        }
        return secondFile.promise;
      }),
      storageManager: roomyStorage(),
    });

    const download = manager.downloadBook(fixture.manifest.slug);
    await vi.waitFor(() => expect(firstAttempts).toBe(2));
    const db = await openVedabaseDb(userId);
    await expect(db.get("library", fixture.manifest.slug)).resolves.toBeUndefined();

    secondFile.resolve(fixture.bodies.get("chapters/two.json")!);
    await download;

    await expect(db.get("library", fixture.manifest.slug)).resolves.toMatchObject({
      activeVersion: fixture.manifest.contentVersion,
    });
  });
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
