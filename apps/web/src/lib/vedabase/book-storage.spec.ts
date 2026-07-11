import { afterEach, describe, expect, it } from "vitest";
import type {
  VedabaseBookManifest,
  VedabaseChapterDocument,
  VedabasePackageFile,
} from "@vedamatch/shared";
import { VedabaseBookStorage } from "./book-storage";
import {
  deleteVedabaseDb,
  openVedabaseDb,
  type VedabaseLocalAnnotation,
} from "./local-db";
import { sha256Hex } from "./package-validator";

const userIds = new Set<string>();

afterEach(async () => {
  await Promise.all([...userIds].map((userId) => deleteVedabaseDb(userId)));
  userIds.clear();
});

async function packageFixture(
  bookSlug = "test-book",
  version = "2026-07-10",
) {
  const chapter: VedabaseChapterDocument = {
    bookSlug,
    slug: "chapter-1",
    title: "Chapter 1",
    order: 1,
    units: [
      {
        id: "unit-1",
        title: "Unit 1",
        sourceUrl: "https://vedabase.ru/test-book/chapter-1/unit-1",
        bodyHtml: "<p>Offline chapter</p>",
      },
    ],
  };
  const body = new Blob([JSON.stringify(chapter)], {
    type: "application/json",
  });
  const file: VedabasePackageFile = {
    path: "chapters/chapter-1.json",
    bytes: body.size,
    sha256: await sha256Hex(body),
    contentType: "application/json",
  };
  const manifest: VedabaseBookManifest = {
    formatVersion: 1,
    slug: bookSlug,
    title: "Test Book",
    author: null,
    language: "ru",
    contentVersion: version,
    packageChecksum: "a".repeat(64),
    sizeBytes: body.size,
    coverPath: null,
    sourceUrl: `https://vedabase.ru/${bookSlug}`,
    sourceOrigin: "https://vedabase.ru",
    importedAt: "2026-07-10T00:00:00.000Z",
    permissionRef: "permission",
    attribution: "vedabase.ru",
    chapters: [
      {
        slug: chapter.slug,
        title: chapter.title,
        order: chapter.order,
        file: file.path,
      },
    ],
    files: [file],
  };

  return { body, chapter, file, manifest };
}

function trackUser(userId: string) {
  userIds.add(userId);
  return userId;
}

describe("VedabaseBookStorage", () => {
  it("isolates databases by user", async () => {
    const firstUser = trackUser("storage-user-a");
    const secondUser = trackUser("storage-user-b");
    const fixture = await packageFixture();
    const firstStorage = new VedabaseBookStorage(firstUser);
    const secondStorage = new VedabaseBookStorage(secondUser);

    await firstStorage.stageManifest(fixture.manifest);
    await firstStorage.stageFile(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
      fixture.file,
      fixture.body,
    );
    await firstStorage.activateVersion(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
    );

    await expect(
      firstStorage.getChapter(fixture.manifest.slug, fixture.chapter.slug),
    ).resolves.toEqual(fixture.chapter);
    await expect(
      secondStorage.getChapter(fixture.manifest.slug, fixture.chapter.slug),
    ).resolves.toBeNull();
  });

  it("persists staged files and activates a complete version atomically", async () => {
    const userId = trackUser("storage-staging");
    const fixture = await packageFixture();
    const storage = new VedabaseBookStorage(userId);

    await storage.stageManifest(fixture.manifest);
    await storage.stageFile(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
      fixture.file,
      fixture.body,
    );

    const db = await openVedabaseDb(userId);
    const stagedFiles = await db.getAll("files");
    expect(stagedFiles).toHaveLength(1);
    expect(stagedFiles[0]?.verified).toBe(true);
    await expect(
      storage.getChapter(fixture.manifest.slug, fixture.chapter.slug),
    ).resolves.toBeNull();

    await storage.activateVersion(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
    );

    await expect(
      storage.getChapter(fixture.manifest.slug, fixture.chapter.slug),
    ).resolves.toEqual(fixture.chapter);
    await expect(db.get("library", fixture.manifest.slug)).resolves.toMatchObject(
      { activeVersion: fixture.manifest.contentVersion },
    );
  });

  it("keeps the active version when a replacement has a bad SHA-256", async () => {
    const userId = trackUser("storage-rollback");
    const current = await packageFixture("test-book", "version-1");
    const replacement = await packageFixture("test-book", "version-2");
    const storage = new VedabaseBookStorage(userId);

    await storage.stageManifest(current.manifest);
    await storage.stageFile(
      current.manifest.slug,
      current.manifest.contentVersion,
      current.file,
      current.body,
    );
    await storage.activateVersion(
      current.manifest.slug,
      current.manifest.contentVersion,
    );

    await storage.stageManifest(replacement.manifest);
    await expect(
      storage.stageFile(
        replacement.manifest.slug,
        replacement.manifest.contentVersion,
        { ...replacement.file, sha256: "0".repeat(64) },
        replacement.body,
      ),
    ).rejects.toThrow("SHA-256");
    await expect(
      storage.activateVersion(
        replacement.manifest.slug,
        replacement.manifest.contentVersion,
      ),
    ).rejects.toThrow("not complete");

    await expect(
      storage.getChapter(current.manifest.slug, current.chapter.slug),
    ).resolves.toEqual(current.chapter);
  });

  it("removes downloaded content but retains annotations", async () => {
    const userId = trackUser("storage-remove");
    const fixture = await packageFixture();
    const storage = new VedabaseBookStorage(userId);
    const annotation: VedabaseLocalAnnotation = {
      id: "annotation-1",
      bookSlug: fixture.manifest.slug,
      payload: { note: "Retain me" },
      revision: 1,
    };

    await storage.stageManifest(fixture.manifest);
    await storage.stageFile(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
      fixture.file,
      fixture.body,
    );
    await storage.activateVersion(
      fixture.manifest.slug,
      fixture.manifest.contentVersion,
    );
    const db = await openVedabaseDb(userId);
    await db.put("annotations", annotation);

    await storage.removeBook(fixture.manifest.slug);

    await expect(
      storage.getChapter(fixture.manifest.slug, fixture.chapter.slug),
    ).resolves.toBeNull();
    await expect(db.get("annotations", annotation.id)).resolves.toEqual(
      annotation,
    );
    await expect(db.getAll("files")).resolves.toHaveLength(0);
  });

  it("deletes the user database during logout cleanup", async () => {
    const userId = trackUser("storage-logout");
    const db = await openVedabaseDb(userId);
    await db.put("preferences", { key: "reader", value: { theme: "sepia" } });

    await deleteVedabaseDb(userId);

    const reopened = await openVedabaseDb(userId);
    await expect(reopened.getAll("preferences")).resolves.toHaveLength(0);
  });
});
