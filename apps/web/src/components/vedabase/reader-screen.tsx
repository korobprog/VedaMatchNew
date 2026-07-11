"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  VedabaseBookManifest,
  VedabaseChapterDocument,
  VedabaseClientMutation,
  VedabaseLocator,
} from "@vedamatch/shared";
import { VedabaseBookStorage } from "@/lib/vedabase/book-storage";
import {
  openVedabaseDb,
  type VedabaseLocalAnnotation,
  type VedabaseLocalBookmark,
  type VedabaseLocalProgress,
} from "@/lib/vedabase/local-db";
import {
  canonicalLocator,
  serializeLocator,
  type VedabaseSelectionRange,
  type VedabaseTextRange,
} from "@/lib/vedabase/locators";
import type { VedabaseSearchResult } from "@/lib/vedabase/search-index";
import {
  AnnotationToolbar,
  type ReaderAnnotationView,
} from "./annotation-toolbar";
import { ChapterContent } from "./chapter-content";
import { ReaderToolbar, type ReaderPreferences } from "./reader-toolbar";
import { SearchDialog } from "./search-dialog";
import { TableOfContents } from "./table-of-contents";

interface ProgressPayload {
  bookSlug: string;
  locator: VedabaseLocator;
  percentage: number;
  lastReadAt: string;
}

interface BookmarkPayload {
  bookSlug: string;
  locator: VedabaseLocator;
  label: string | null;
  deletedAt: string | null;
}

interface AnnotationPayload {
  bookSlug: string;
  kind: "highlight" | "note";
  locator: VedabaseLocator;
  range: VedabaseTextRange;
  color: string | null;
  noteText: string | null;
  deletedAt: string | null;
}

type ReaderBookmark = Omit<VedabaseLocalBookmark, "payload"> & {
  payload: BookmarkPayload;
};
type ReaderAnnotation = Omit<VedabaseLocalAnnotation, "payload"> & {
  payload: AnnotationPayload;
};

const defaultPreferences: ReaderPreferences = {
  theme: "light",
  fontSize: 18,
  lineWidth: "medium",
};

export class VedabaseReaderRepository {
  private readonly database;
  private readonly books;

  constructor(userId: string) {
    this.database = openVedabaseDb(userId);
    this.books = new VedabaseBookStorage(userId);
  }

  async loadBook(bookSlug: string): Promise<VedabaseBookManifest | null> {
    return (await (await this.database).get("library", bookSlug))?.manifest ?? null;
  }

  loadChapter(bookSlug: string, chapterSlug: string): Promise<VedabaseChapterDocument | null> {
    return this.books.getChapter(bookSlug, chapterSlug);
  }

  async loadPreferences(): Promise<ReaderPreferences> {
    const record = await (await this.database).get("preferences", "reader");
    return isReaderPreferences(record?.value) ? record.value : defaultPreferences;
  }

  async savePreferences(preferences: ReaderPreferences): Promise<void> {
    await (await this.database).put("preferences", {
      key: "reader",
      value: preferences,
    });
  }

  async loadProgress(bookSlug: string): Promise<(VedabaseLocalProgress & { payload: ProgressPayload }) | null> {
    const record = await (await this.database).get("progress", bookSlug);
    const payload = progressPayload(record?.payload);
    return record && payload ? { ...record, payload } : null;
  }

  async saveProgress(locator: VedabaseLocator, percentage: number): Promise<void> {
    const database = await this.database;
    const current = await database.get("progress", locator.bookSlug);
    const createdAt = new Date().toISOString();
    const payload: ProgressPayload = {
      bookSlug: locator.bookSlug,
      locator: canonicalLocator(locator),
      percentage: Math.min(100, Math.max(0, Math.round(percentage))),
      lastReadAt: createdAt,
    };
    const mutation = createMutation("progress", locator.bookSlug, current?.revision ?? null, payload, createdAt);
    const transaction = database.transaction(["progress", "mutationQueue"], "readwrite");
    await transaction.objectStore("progress").put({
      bookSlug: locator.bookSlug,
      payload,
      revision: current?.revision ?? null,
    });
    await transaction.objectStore("mutationQueue").put(mutation);
    await transaction.done;
  }

  async loadBookmarks(bookSlug: string): Promise<ReaderBookmark[]> {
    return (await (await this.database).getAll("bookmarks")).flatMap((record) => {
      const payload = bookmarkPayload(record.payload);
      return payload?.bookSlug === bookSlug ? [{ ...record, payload }] : [];
    });
  }

  async toggleBookmark(locator: VedabaseLocator): Promise<ReaderBookmark> {
    const database = await this.database;
    const bookmarks = await this.loadBookmarks(locator.bookSlug);
    const active = bookmarks.find(
      (bookmark) =>
        bookmark.payload.deletedAt === null &&
        serializeLocator(bookmark.payload.locator) === serializeLocator(locator),
    );
    const createdAt = new Date().toISOString();
    const id = active?.id ?? crypto.randomUUID();
    const payload: BookmarkPayload = active
      ? { ...active.payload, deletedAt: createdAt }
      : {
          bookSlug: locator.bookSlug,
          locator: canonicalLocator(locator),
          label: null,
          deletedAt: null,
        };
    const revision = active?.revision ?? null;
    const record: ReaderBookmark = { id, bookSlug: locator.bookSlug, payload, revision };
    const mutation = createMutation("bookmark", id, revision, payload, createdAt);
    const transaction = database.transaction(["bookmarks", "mutationQueue"], "readwrite");
    await transaction.objectStore("bookmarks").put(record);
    await transaction.objectStore("mutationQueue").put(mutation);
    await transaction.done;
    return record;
  }

  async loadAnnotations(bookSlug: string): Promise<ReaderAnnotation[]> {
    return (await (await this.database).getAll("annotations")).flatMap((record) => {
      const payload = annotationPayload(record.payload);
      return payload?.bookSlug === bookSlug ? [{ ...record, payload }] : [];
    });
  }

  async createAnnotation(
    selection: VedabaseSelectionRange,
    kind: "highlight" | "note",
    noteText: string | null,
  ): Promise<ReaderAnnotation> {
    const database = await this.database;
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const payload: AnnotationPayload = {
      bookSlug: selection.locator.bookSlug,
      kind,
      locator: canonicalLocator(selection.locator),
      range: selection.range,
      color: kind === "highlight" ? "yellow" : null,
      noteText,
      deletedAt: null,
    };
    const record: ReaderAnnotation = {
      id,
      bookSlug: payload.bookSlug,
      payload,
      revision: null,
    };
    const mutation = createMutation("annotation", id, null, payload, createdAt);
    const transaction = database.transaction(["annotations", "mutationQueue"], "readwrite");
    await transaction.objectStore("annotations").put(record);
    await transaction.objectStore("mutationQueue").put(mutation);
    await transaction.done;
    return record;
  }

  async updateNote(id: string, noteText: string): Promise<ReaderAnnotation> {
    const database = await this.database;
    const current = await database.get("annotations", id);
    const currentPayload = annotationPayload(current?.payload);
    if (!current || !currentPayload) throw new Error("The local note no longer exists");
    const createdAt = new Date().toISOString();
    const payload: AnnotationPayload = { ...currentPayload, noteText };
    const record: ReaderAnnotation = { ...current, payload };
    const mutation = createMutation("annotation", id, current.revision, payload, createdAt);
    const transaction = database.transaction(["annotations", "mutationQueue"], "readwrite");
    await transaction.objectStore("annotations").put(record);
    await transaction.objectStore("mutationQueue").put(mutation);
    await transaction.done;
    return record;
  }
}

export function ReaderScreen({
  userId,
  bookSlug,
  chapterSlug,
  onNavigate,
}: {
  userId: string;
  bookSlug: string;
  chapterSlug: string;
  onNavigate?(chapterSlug: string, unitId?: string): void;
}) {
  const repository = useMemo(() => new VedabaseReaderRepository(userId), [userId]);
  const readerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<VedabaseBookManifest | null>(null);
  const [chapter, setChapter] = useState<VedabaseChapterDocument | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [activeLocator, setActiveLocator] = useState<VedabaseLocator | null>(null);
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    void Promise.all([
      repository.loadBook(bookSlug),
      repository.loadChapter(bookSlug, chapterSlug),
      repository.loadPreferences(),
      repository.loadProgress(bookSlug),
      repository.loadBookmarks(bookSlug),
      repository.loadAnnotations(bookSlug),
    ])
      .then(([book, loadedChapter, loadedPreferences, progress, loadedBookmarks, loadedAnnotations]) => {
        if (cancelled) return;
        setManifest(book);
        setChapter(loadedChapter);
        setPreferences(loadedPreferences);
        setBookmarks(loadedBookmarks);
        setAnnotations(loadedAnnotations);
        const restored = progress?.payload.locator;
        const restoredExists =
          restored?.chapterSlug === chapterSlug &&
          loadedChapter?.units.some((unit) => unit.id === restored.unitId);
        setActiveLocator(
          restoredExists
            ? restored
            : loadedChapter?.units[0]
              ? { bookSlug, chapterSlug, unitId: loadedChapter.units[0].id }
              : null,
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(message(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookSlug, chapterSlug, repository]);

  useEffect(() => {
    if (!activeLocator || activeLocator.chapterSlug !== chapterSlug) return;
    const element = [...(readerRef.current?.querySelectorAll<HTMLElement>("[data-unit-id]") ?? [])].find(
      (candidate) => candidate.dataset.unitId === activeLocator.unitId,
    );
    element?.scrollIntoView?.({ block: "start" });
  }, [activeLocator, chapterSlug, chapter]);

  const orderedChapters = useMemo(
    () => [...(manifest?.chapters ?? [])].sort((left, right) => left.order - right.order),
    [manifest],
  );
  const chapterIndex = orderedChapters.findIndex((item) => item.slug === chapterSlug);
  const previous = chapterIndex > 0 ? orderedChapters[chapterIndex - 1] : undefined;
  const next = chapterIndex >= 0 ? orderedChapters[chapterIndex + 1] : undefined;
  const bookmarked =
    activeLocator !== null &&
    bookmarks.some(
      (bookmark) =>
        bookmark.payload.deletedAt === null &&
        serializeLocator(bookmark.payload.locator) === serializeLocator(activeLocator),
    );
  const lineWidth = { narrow: "42rem", medium: "56rem", wide: "72rem" }[preferences.lineWidth];

  const navigate = (targetChapter: string, unitId?: string) => {
    if (onNavigate) {
      if (unitId === undefined) onNavigate(targetChapter);
      else onNavigate(targetChapter, unitId);
      return;
    }
    const suffix = unitId ? `#${encodeURIComponent(unitId)}` : "";
    window.location.assign(
      `/vedabase/books/${encodeURIComponent(bookSlug)}/${encodeURIComponent(targetChapter)}${suffix}`,
    );
  };

  const activateUnit = (unitId: string) => {
    const locator = { bookSlug, chapterSlug, unitId };
    setActiveLocator(locator);
    const percentage = orderedChapters.length > 0 ? ((chapterIndex + 1) / orderedChapters.length) * 100 : 0;
    void repository.saveProgress(locator, percentage).catch((saveError) => setError(message(saveError)));
  };

  const updatePreferences = (value: ReaderPreferences) => {
    setPreferences(value);
    void repository.savePreferences(value).catch((saveError) => setError(message(saveError)));
  };

  const toggleBookmark = () => {
    if (!activeLocator) return;
    void repository
      .toggleBookmark(activeLocator)
      .then((saved) =>
        setBookmarks((current) => [...current.filter((item) => item.id !== saved.id), saved]),
      )
      .catch((saveError) => setError(message(saveError)));
  };

  const addAnnotation = (
    selection: VedabaseSelectionRange,
    kind: "highlight" | "note",
    noteText: string | null,
  ) => {
    void repository
      .createAnnotation(selection, kind, noteText)
      .then((saved) => setAnnotations((current) => [...current, saved]))
      .catch((saveError) => setError(message(saveError)));
  };

  const updateNote = (id: string, noteText: string) => {
    void repository
      .updateNote(id, noteText)
      .then((saved) =>
        setAnnotations((current) => [...current.filter((item) => item.id !== id), saved]),
      )
      .catch((saveError) => setError(message(saveError)));
  };

  const selectSearchResult = (result: VedabaseSearchResult) => {
    setSearchOpen(false);
    if (result.bookSlug === bookSlug && result.chapterSlug === chapterSlug) {
      setActiveLocator({ bookSlug, chapterSlug, unitId: result.unitId });
    } else if (result.bookSlug === bookSlug) {
      navigate(result.chapterSlug, result.unitId);
    } else {
      window.location.assign(
        `/vedabase/books/${encodeURIComponent(result.bookSlug)}/${encodeURIComponent(result.chapterSlug)}#${encodeURIComponent(result.unitId)}`,
      );
    }
  };

  if (loading) return <p className="p-6 text-sm text-zinc-500">Loading local chapter…</p>;
  if (error && !chapter) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>;
  if (!manifest || !chapter) {
    return (
      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        This chapter is not available offline. Download the complete book while online and try again.
      </p>
    );
  }

  const annotationViews: ReaderAnnotationView[] = annotations.map((annotation) => ({
    id: annotation.id,
    kind: annotation.payload.kind,
    noteText: annotation.payload.noteText,
    deletedAt: annotation.payload.deletedAt,
  }));
  const themeClass =
    preferences.theme === "sepia"
      ? "bg-amber-50 text-stone-900"
      : preferences.theme === "dark"
        ? "bg-zinc-950 text-zinc-100"
        : "bg-zinc-50 text-zinc-900";

  return (
    <main data-reader-theme={preferences.theme} className={`min-h-screen ${themeClass}`}>
      <div className="mx-auto space-y-4 px-4 py-6" style={{ maxWidth: lineWidth, fontSize: preferences.fontSize }}>
        <ReaderToolbar
          preferences={preferences}
          hasPrevious={Boolean(previous)}
          hasNext={Boolean(next)}
          bookmarked={bookmarked}
          onPreferencesChange={updatePreferences}
          onPrevious={() => previous && navigate(previous.slug)}
          onNext={() => next && navigate(next.slug)}
          onToggleBookmark={toggleBookmark}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <TableOfContents chapters={orderedChapters} currentChapterSlug={chapterSlug} onNavigate={navigate} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <header className="py-4">
          <p className="text-sm text-zinc-500">{manifest.title}</p>
          <h1 className="mt-1 text-3xl font-bold">{chapter.title}</h1>
        </header>
        <AnnotationToolbar
          readerRef={readerRef}
          bookSlug={bookSlug}
          chapterSlug={chapterSlug}
          annotations={annotationViews}
          onCreateHighlight={(selection) => addAnnotation(selection, "highlight", null)}
          onCreateNote={(selection, noteText) => addAnnotation(selection, "note", noteText)}
          onUpdateNote={updateNote}
        />
        <ChapterContent ref={readerRef} chapter={chapter} onUnitActivate={activateUnit} />
      </div>
      <SearchDialog
        open={searchOpen}
        userId={userId}
        bookSlug={bookSlug}
        onClose={() => setSearchOpen(false)}
        onSelect={selectSearchResult}
      />
    </main>
  );
}

function createMutation(
  entity: VedabaseClientMutation["entity"],
  entityId: string,
  baseRevision: number | null,
  payload: unknown,
  createdAt: string,
): VedabaseClientMutation {
  return {
    clientMutationId: crypto.randomUUID(),
    entity,
    entityId,
    baseRevision,
    payload,
    createdAt,
  };
}

function isReaderPreferences(value: unknown): value is ReaderPreferences {
  return (
    isRecord(value) &&
    (value.theme === "light" || value.theme === "dark" || value.theme === "sepia") &&
    Number.isSafeInteger(value.fontSize) &&
    Number(value.fontSize) >= 14 &&
    Number(value.fontSize) <= 26 &&
    (value.lineWidth === "narrow" || value.lineWidth === "medium" || value.lineWidth === "wide")
  );
}

function progressPayload(value: unknown): ProgressPayload | null {
  if (!isRecord(value) || typeof value.percentage !== "number" || typeof value.lastReadAt !== "string") return null;
  const locator = locatorPayload(value.locator);
  return locator && typeof value.bookSlug === "string"
    ? { bookSlug: value.bookSlug, locator, percentage: value.percentage, lastReadAt: value.lastReadAt }
    : null;
}

function bookmarkPayload(value: unknown): BookmarkPayload | null {
  if (!isRecord(value) || typeof value.bookSlug !== "string") return null;
  const locator = locatorPayload(value.locator);
  if (!locator) return null;
  return {
    bookSlug: value.bookSlug,
    locator,
    label: typeof value.label === "string" ? value.label : null,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
  };
}

function annotationPayload(value: unknown): AnnotationPayload | null {
  if (
    !isRecord(value) ||
    typeof value.bookSlug !== "string" ||
    (value.kind !== "highlight" && value.kind !== "note") ||
    !isRecord(value.range)
  ) return null;
  const locator = locatorPayload(value.locator);
  const range = value.range;
  if (
    !locator ||
    typeof range.block !== "string" ||
    typeof range.start !== "number" ||
    typeof range.end !== "number" ||
    typeof range.quote !== "string"
  ) return null;
  return {
    bookSlug: value.bookSlug,
    kind: value.kind,
    locator,
    range: { block: range.block, start: range.start, end: range.end, quote: range.quote },
    color: typeof value.color === "string" ? value.color : null,
    noteText: typeof value.noteText === "string" ? value.noteText : null,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
  };
}

function locatorPayload(value: unknown): VedabaseLocator | null {
  if (
    !isRecord(value) ||
    typeof value.bookSlug !== "string" ||
    typeof value.chapterSlug !== "string" ||
    typeof value.unitId !== "string"
  ) return null;
  try {
    return canonicalLocator({
      bookSlug: value.bookSlug,
      chapterSlug: value.chapterSlug,
      unitId: value.unitId,
      block: typeof value.block === "string" ? value.block : undefined,
      start: typeof value.start === "number" ? value.start : undefined,
      end: typeof value.end === "number" ? value.end : undefined,
    });
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The local reader operation failed";
}
