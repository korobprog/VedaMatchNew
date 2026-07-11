import type {
  VedabaseBookManifest,
  VedabaseChapterDocument,
  VedabasePackageFile,
} from "@vedamatch/shared";
import {
  vedabaseBookVersionKey,
  vedabaseFileKey,
  openVedabaseDb,
  type VedabaseBookVersionRecord,
  type VedabaseDb,
  type VedabaseStoredFile,
} from "./local-db";
import {
  PackageValidationError,
  readBlobAsArrayBuffer,
  validateBookManifest,
  validateChapterDocument,
  validatePackageFile,
} from "./package-validator";

export class VedabaseBookStorage {
  private readonly database: Promise<VedabaseDb>;

  constructor(userId: string) {
    this.database = openVedabaseDb(userId);
  }

  async stageManifest(manifestValue: VedabaseBookManifest): Promise<void> {
    const manifest = validateBookManifest(manifestValue);
    const database = await this.database;
    const key = vedabaseBookVersionKey(manifest.slug, manifest.contentVersion);
    const existing = await database.get("bookVersions", key);
    const stagedAt = new Date().toISOString();
    const record: VedabaseBookVersionRecord = {
      key,
      bookSlug: manifest.slug,
      version: manifest.contentVersion,
      manifest,
      status: existing?.status === "active" ? "active" : "staged",
      stagedAt,
      activatedAt: existing?.activatedAt ?? null,
    };

    await database.put("bookVersions", record);
  }

  async stageFile(
    bookSlug: string,
    version: string,
    file: VedabasePackageFile,
    body: Blob,
  ): Promise<void> {
    await validatePackageFile(file, body);
    const database = await this.database;
    const buffer = await readBlobAsArrayBuffer(body);
    const record: VedabaseStoredFile = {
      key: vedabaseFileKey(bookSlug, version, file.path),
      bookVersionKey: vedabaseBookVersionKey(bookSlug, version),
      bookSlug,
      version,
      path: file.path,
      metadata: { ...file, sha256: file.sha256.toLowerCase() },
      body: buffer,
      verified: true,
      stagedAt: new Date().toISOString(),
    };

    await database.put("files", record);
  }

  async activateVersion(bookSlug: string, version: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(
      ["library", "bookVersions", "files"],
      "readwrite",
    );
    const versionStore = transaction.objectStore("bookVersions");
    const fileStore = transaction.objectStore("files");
    const libraryStore = transaction.objectStore("library");
    const key = vedabaseBookVersionKey(bookSlug, version);
    const target = await versionStore.get(key);
    if (!target) {
      throw new PackageValidationError(
        `Book version ${bookSlug}@${version} has no staged manifest`,
      );
    }
    if (
      target.manifest.slug !== bookSlug ||
      target.manifest.contentVersion !== version
    ) {
      throw new PackageValidationError("Staged book manifest does not match its key");
    }

    const files = await Promise.all(
      target.manifest.files.map((file) =>
        fileStore.get(vedabaseFileKey(bookSlug, version, file.path)),
      ),
    );
    const complete = target.manifest.files.every((file, index) => {
      const stored = files[index];
      return (
        stored?.verified === true &&
        stored.metadata.bytes === file.bytes &&
        stored.metadata.sha256 === file.sha256.toLowerCase() &&
        stored.metadata.contentType === file.contentType
      );
    });
    if (!complete) {
      throw new PackageValidationError(
        `Book version ${bookSlug}@${version} is not complete`,
      );
    }

    const current = await libraryStore.get(bookSlug);
    const activatedAt = new Date().toISOString();
    if (current && current.activeVersion !== version) {
      const previousKey = vedabaseBookVersionKey(bookSlug, current.activeVersion);
      const previous = await versionStore.get(previousKey);
      if (previous) {
        await versionStore.put({ ...previous, status: "inactive" });
      }
    }

    await Promise.all([
      versionStore.put({
        ...target,
        status: "active",
        activatedAt,
      }),
      libraryStore.put({
        bookSlug,
        activeVersion: version,
        manifest: target.manifest,
        activatedAt,
      }),
    ]);
    await transaction.done;
  }

  async getChapter(
    bookSlug: string,
    chapterSlug: string,
  ): Promise<VedabaseChapterDocument | null> {
    const database = await this.database;
    const activeBook = await database.get("library", bookSlug);
    if (!activeBook) {
      return null;
    }

    const chapter = activeBook.manifest.chapters.find(
      (candidate) => candidate.slug === chapterSlug,
    );
    if (!chapter) {
      return null;
    }

    const stored = await database.get(
      "files",
      vedabaseFileKey(bookSlug, activeBook.activeVersion, chapter.file),
    );
    if (!stored?.verified) {
      return null;
    }

    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(stored.body));
    } catch {
      throw new PackageValidationError(
        `Stored chapter ${bookSlug}/${chapterSlug} is not valid JSON`,
      );
    }
    const document = validateChapterDocument(value);
    if (document.bookSlug !== bookSlug || document.slug !== chapterSlug) {
      throw new PackageValidationError(
        `Stored chapter ${bookSlug}/${chapterSlug} does not match its manifest`,
      );
    }

    return document;
  }

  async removeBook(bookSlug: string): Promise<void> {
    const database = await this.database;
    const [versions, files] = await Promise.all([
      database.getAll("bookVersions"),
      database.getAll("files"),
    ]);
    const transaction = database.transaction(
      ["library", "bookVersions", "files", "downloadState"],
      "readwrite",
    );
    const requests: Array<Promise<unknown>> = [
      transaction.objectStore("library").delete(bookSlug),
      transaction.objectStore("downloadState").delete(bookSlug),
    ];

    for (const version of versions) {
      if (version.bookSlug === bookSlug) {
        requests.push(
          transaction.objectStore("bookVersions").delete(version.key),
        );
      }
    }
    for (const file of files) {
      if (file.bookSlug === bookSlug) {
        requests.push(transaction.objectStore("files").delete(file.key));
      }
    }

    await Promise.all(requests);
    await transaction.done;
  }

  async close(): Promise<void> {
    const database = await this.database;
    database.close();
  }
}
