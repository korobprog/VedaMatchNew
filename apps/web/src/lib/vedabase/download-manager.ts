import type {
  VedabaseBookManifest,
  VedabaseLibraryManifest,
} from "@vedamatch/shared";
import {
  fetchVedabaseBookManifest,
  fetchVedabaseChapter,
  fetchVedabaseCover,
  fetchVedabaseSearchIndex,
} from "../vedabase-client-api";
import { VedabaseBookStorage } from "./book-storage";
import {
  openVedabaseDb,
  type VedabaseDb,
  type VedabaseDownloadState,
} from "./local-db";
import { PackageValidationError } from "./package-validator";

export interface VedabaseLibraryDownloadState {
  totalBooks: number;
  completedBooks: number;
  currentBookSlug: string | null;
}

export interface VedabaseDownloadSnapshot {
  downloads: Record<string, VedabaseDownloadState>;
  libraryDownload: VedabaseLibraryDownloadState | null;
}

export interface VedabaseDownloadController {
  downloadBook(bookSlug: string): Promise<void>;
  resumeBook(bookSlug: string): Promise<void>;
  downloadLibrary(library: VedabaseLibraryManifest): Promise<void>;
  removeBook(bookSlug: string): Promise<void>;
  pauseBook(bookSlug: string): void;
  initialize(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): VedabaseDownloadSnapshot;
}

interface VedabaseBookStorageAdapter {
  stageManifest(manifest: VedabaseBookManifest): Promise<void>;
  stageFile(
    bookSlug: string,
    version: string,
    file: VedabaseBookManifest["files"][number],
    body: Blob,
  ): Promise<void>;
  activateVersion(bookSlug: string, version: string): Promise<void>;
  removeBook(bookSlug: string): Promise<void>;
}

interface BrowserStorageManager {
  estimate(): Promise<{ quota?: number; usage?: number }>;
  persist?(): Promise<boolean>;
}

export interface VedabaseDownloadManagerOptions {
  fetchManifest?: (
    bookSlug: string,
    signal?: AbortSignal,
  ) => Promise<VedabaseBookManifest>;
  fetchFile?: (
    bookSlug: string,
    version: string,
    path: string,
    signal?: AbortSignal,
  ) => Promise<Blob>;
  storage?: VedabaseBookStorageAdapter;
  database?: Promise<VedabaseDb>;
  storageManager?: BrowserStorageManager | null;
}

export class VedabaseQuotaError extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly availableBytes: number,
  ) {
    super(
      `Недостаточно места: требуется ${requiredBytes} байт, доступно ${availableBytes} байт`,
    );
    this.name = "VedabaseQuotaError";
  }
}

export class VedabaseDownloadManager implements VedabaseDownloadController {
  private readonly database: Promise<VedabaseDb>;
  private readonly storage: VedabaseBookStorageAdapter;
  private readonly fetchManifest: NonNullable<
    VedabaseDownloadManagerOptions["fetchManifest"]
  >;
  private readonly fetchFile: NonNullable<VedabaseDownloadManagerOptions["fetchFile"]>;
  private readonly storageManager: BrowserStorageManager | null;
  private readonly listeners = new Set<() => void>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly operations = new Map<string, Promise<void>>();
  private persistenceRequested = false;
  private snapshot: VedabaseDownloadSnapshot = {
    downloads: {},
    libraryDownload: null,
  };

  constructor(userId: string, options: VedabaseDownloadManagerOptions = {}) {
    this.database = options.database ?? openVedabaseDb(userId);
    this.storage = options.storage ?? new VedabaseBookStorage(userId);
    this.fetchManifest = options.fetchManifest ?? fetchVedabaseBookManifest;
    this.fetchFile = options.fetchFile ?? fetchExplicitBookFile;
    this.storageManager =
      options.storageManager === undefined
        ? getBrowserStorageManager()
        : options.storageManager;
  }

  getSnapshot = (): VedabaseDownloadSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    const database = await this.database;
    const downloads = await database.getAll("downloadState");
    this.snapshot = {
      ...this.snapshot,
      downloads: Object.fromEntries(
        downloads.map((download) => [download.bookSlug, download]),
      ),
    };
    this.emit();
  }

  downloadBook(bookSlug: string): Promise<void> {
    return this.startBookDownload(bookSlug, true);
  }

  resumeBook(bookSlug: string): Promise<void> {
    return this.startBookDownload(bookSlug, true);
  }

  pauseBook(bookSlug: string): void {
    this.controllers.get(bookSlug)?.abort();
  }

  async downloadLibrary(library: VedabaseLibraryManifest): Promise<void> {
    await this.requestPersistence();
    this.setLibraryDownload({
      totalBooks: library.books.length,
      completedBooks: 0,
      currentBookSlug: library.books[0]?.slug ?? null,
    });

    let completedBooks = 0;
    for (const book of library.books) {
      this.setLibraryDownload({
        totalBooks: library.books.length,
        completedBooks,
        currentBookSlug: book.slug,
      });
      await this.startBookDownload(book.slug, false);
      completedBooks += 1;
    }

    this.setLibraryDownload({
      totalBooks: library.books.length,
      completedBooks,
      currentBookSlug: null,
    });
  }

  async removeBook(bookSlug: string): Promise<void> {
    this.pauseBook(bookSlug);
    await this.storage.removeBook(bookSlug);
    const downloads = { ...this.snapshot.downloads };
    delete downloads[bookSlug];
    this.snapshot = { ...this.snapshot, downloads };
    this.emit();
  }

  private startBookDownload(
    bookSlug: string,
    requestPersistence: boolean,
  ): Promise<void> {
    const existing = this.operations.get(bookSlug);
    if (existing) {
      return existing;
    }

    const operation = this.runBookDownload(bookSlug, requestPersistence).finally(
      () => {
        this.operations.delete(bookSlug);
        this.controllers.delete(bookSlug);
      },
    );
    this.operations.set(bookSlug, operation);
    return operation;
  }

  private async runBookDownload(
    bookSlug: string,
    requestPersistence: boolean,
  ): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(bookSlug, controller);
    let manifest: VedabaseBookManifest | null = null;

    try {
      manifest = await this.fetchManifest(bookSlug, controller.signal);
      const database = await this.database;
      const activeBook = await database.get("library", bookSlug);
      if (activeBook?.activeVersion === manifest.contentVersion) {
        await this.updateDownload({
          bookSlug,
          version: manifest.contentVersion,
          status: "complete",
          downloadedBytes: manifest.sizeBytes,
          totalBytes: manifest.sizeBytes,
          error: null,
        });
        return;
      }

      const storedFiles = await database.getAll("files");
      const verifiedPaths = new Set(
        storedFiles
          .filter(
            (stored) =>
              stored.bookSlug === bookSlug &&
              stored.version === manifest!.contentVersion &&
              stored.verified &&
              manifest!.files.some(
                (file) =>
                  file.path === stored.path &&
                  file.bytes === stored.metadata.bytes &&
                  file.sha256.toLowerCase() === stored.metadata.sha256,
              ),
          )
          .map((stored) => stored.path),
      );
      let downloadedBytes = manifest.files
        .filter((file) => verifiedPaths.has(file.path))
        .reduce((sum, file) => sum + file.bytes, 0);
      const requiredBytes = manifest.files
        .filter((file) => !verifiedPaths.has(file.path))
        .reduce((sum, file) => sum + file.bytes, 0);

      await this.ensureQuota(requiredBytes);
      if (requestPersistence) {
        await this.requestPersistence();
      }
      await this.storage.stageManifest(manifest);
      await this.updateDownload({
        bookSlug,
        version: manifest.contentVersion,
        status: "downloading",
        downloadedBytes,
        totalBytes: manifest.sizeBytes,
        error: null,
      });

      for (const file of manifest.files) {
        if (verifiedPaths.has(file.path)) {
          continue;
        }
        await this.downloadAndStageFile(manifest, file, controller.signal);
        downloadedBytes += file.bytes;
        await this.updateDownload({
          bookSlug,
          version: manifest.contentVersion,
          status: "downloading",
          downloadedBytes,
          totalBytes: manifest.sizeBytes,
          error: null,
        });
      }

      await this.storage.activateVersion(bookSlug, manifest.contentVersion);
      await this.updateDownload({
        bookSlug,
        version: manifest.contentVersion,
        status: "complete",
        downloadedBytes,
        totalBytes: manifest.sizeBytes,
        error: null,
      });
    } catch (error) {
      const previous = this.snapshot.downloads[bookSlug];
      const state: VedabaseDownloadState = {
        bookSlug,
        version: manifest?.contentVersion ?? previous?.version ?? "unknown",
        status: controller.signal.aborted || isAbortError(error) ? "paused" : "error",
        downloadedBytes: previous?.downloadedBytes ?? 0,
        totalBytes: manifest?.sizeBytes ?? previous?.totalBytes ?? 0,
        error:
          controller.signal.aborted || isAbortError(error)
            ? null
            : errorMessage(error),
      };
      await this.updateDownload(state);
      if (state.status === "paused") {
        return;
      }
      throw error;
    }
  }

  private async downloadAndStageFile(
    manifest: VedabaseBookManifest,
    file: VedabaseBookManifest["files"][number],
    signal: AbortSignal,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = await this.fetchFile(
        manifest.slug,
        manifest.contentVersion,
        file.path,
        signal,
      );
      try {
        await this.storage.stageFile(
          manifest.slug,
          manifest.contentVersion,
          file,
          body,
        );
        return;
      } catch (error) {
        if (!(error instanceof PackageValidationError) || attempt === 1) {
          throw error;
        }
      }
    }
  }

  private async ensureQuota(requiredBytes: number): Promise<void> {
    if (!this.storageManager || requiredBytes === 0) {
      return;
    }

    let estimate: { quota?: number; usage?: number };
    try {
      estimate = await this.storageManager.estimate();
    } catch {
      return;
    }
    if (estimate.quota === undefined) {
      return;
    }

    const availableBytes = Math.max(
      0,
      estimate.quota - (estimate.usage ?? 0),
    );
    if (availableBytes < requiredBytes) {
      throw new VedabaseQuotaError(requiredBytes, availableBytes);
    }
  }

  private async requestPersistence(): Promise<void> {
    if (this.persistenceRequested) {
      return;
    }
    this.persistenceRequested = true;
    try {
      await this.storageManager?.persist?.();
    } catch {}
  }

  private async updateDownload(state: VedabaseDownloadState): Promise<void> {
    const database = await this.database;
    await database.put("downloadState", state);
    this.snapshot = {
      ...this.snapshot,
      downloads: { ...this.snapshot.downloads, [state.bookSlug]: state },
    };
    this.emit();
  }

  private setLibraryDownload(state: VedabaseLibraryDownloadState): void {
    this.snapshot = { ...this.snapshot, libraryDownload: state };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

async function fetchExplicitBookFile(
  bookSlug: string,
  _version: string,
  path: string,
  signal?: AbortSignal,
): Promise<Blob> {
  if (path === "search-index.json") {
    return fetchVedabaseSearchIndex(bookSlug, signal);
  }
  if (/^(?:cover|images\/cover)\./i.test(path)) {
    return fetchVedabaseCover(bookSlug, signal);
  }
  const chapterMatch = path.match(/^chapters\/(.+)\.json$/);
  if (chapterMatch) {
    return fetchVedabaseChapter(bookSlug, decodeURIComponent(chapterMatch[1]), signal);
  }
  throw new Error(`Unsupported Vedabase offline file: ${path}`);
}

function getBrowserStorageManager(): BrowserStorageManager | null {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return null;
  }
  return navigator.storage;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось скачать книгу";
}
