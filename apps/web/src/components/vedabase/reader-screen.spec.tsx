import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  VedabaseBookManifest,
  VedabaseChapterDocument,
  VedabaseLocator,
} from "@vedamatch/shared";
import {
  deleteVedabaseDb,
  vedabaseFileKey,
  openVedabaseDb,
} from "@/lib/vedabase/local-db";
import {
  serializeLocator,
  serializeTextRange,
} from "@/lib/vedabase/locators";
import { ReaderScreen } from "./reader-screen";

const userId = "reader-user";
const bookSlug = "book-one";
const contentVersion = "version-one";

const chapters: VedabaseChapterDocument[] = [
  {
    bookSlug,
    slug: "chapter-1",
    title: "Chapter One",
    order: 1,
    units: [
      {
        id: "unit-1",
        title: "First unit",
        sourceUrl: "https://vedabase.ru/book-one/1/1/",
        translationHtml:
          '<p>Yoga action begins here.</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
      },
      {
        id: "unit-2",
        title: "Second unit",
        sourceUrl: "https://vedabase.ru/book-one/1/2/",
        translationHtml: "<p>Restored reading position.</p>",
      },
    ],
  },
  {
    bookSlug,
    slug: "chapter-2",
    title: "Chapter Two",
    order: 2,
    units: [
      {
        id: "unit-3",
        title: "Detached action",
        sourceUrl: "https://vedabase.ru/book-one/2/1/",
        translationHtml: "<p>Act without attachment and remain steady.</p>",
      },
    ],
  },
];

const manifest: VedabaseBookManifest = {
  formatVersion: 1,
  slug: bookSlug,
  title: "Book One",
  author: null,
  language: "ru",
  contentVersion,
  packageChecksum: "a".repeat(64),
  sizeBytes: 1,
  coverPath: null,
  sourceUrl: "https://vedabase.ru/book-one/",
  sourceOrigin: "https://vedabase.ru",
  importedAt: "2026-07-10T00:00:00.000Z",
  permissionRef: "permission",
  attribution: "vedabase.ru",
  chapters: chapters.map((chapter) => ({
    slug: chapter.slug,
    title: chapter.title,
    order: chapter.order,
    file: `chapters/${chapter.slug}.json`,
  })),
  files: [],
};

function buffer(value: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function seedReader(options?: { withProgress?: boolean }) {
  const database = await openVedabaseDb(userId);
  await database.put("library", {
    bookSlug,
    activeVersion: contentVersion,
    manifest,
    activatedAt: "2026-07-10T00:00:00.000Z",
  });
  for (const chapter of chapters) {
    const path = `chapters/${chapter.slug}.json`;
    await database.put("files", {
      key: vedabaseFileKey(bookSlug, contentVersion, path),
      bookVersionKey: JSON.stringify([bookSlug, contentVersion]),
      bookSlug,
      version: contentVersion,
      path,
      metadata: {
        path,
        bytes: 1,
        sha256: "b".repeat(64),
        contentType: "application/json",
      },
      body: buffer(chapter),
      verified: true,
      stagedAt: "2026-07-10T00:00:00.000Z",
    });
  }
  const searchIndex = [
    {
      token: "act",
      hits: [
        { chapterSlug: "chapter-2", unitId: "unit-3", field: "translationHtml" },
      ],
    },
    {
      token: "attachment",
      hits: [
        { chapterSlug: "chapter-2", unitId: "unit-3", field: "translationHtml" },
      ],
    },
  ];
  await database.put("files", {
    key: vedabaseFileKey(bookSlug, contentVersion, "search-index.json"),
    bookVersionKey: JSON.stringify([bookSlug, contentVersion]),
    bookSlug,
    version: contentVersion,
    path: "search-index.json",
    metadata: {
      path: "search-index.json",
      bytes: 1,
      sha256: "c".repeat(64),
      contentType: "application/json",
    },
    body: buffer(searchIndex),
    verified: true,
    stagedAt: "2026-07-10T00:00:00.000Z",
  });
  if (options?.withProgress) {
    await database.put("progress", {
      bookSlug,
      payload: {
        bookSlug,
        locator: { bookSlug, chapterSlug: "chapter-1", unitId: "unit-2" },
        percentage: 50,
        lastReadAt: "2026-07-10T00:00:00.000Z",
      },
      revision: 3,
    });
  }
  database.close();
}

function selectText(testId: string, start: number, end: number) {
  const block = screen.getByTestId(testId);
  const text = block.querySelector("p")?.firstChild;
  if (!text) throw new Error("Expected a text node in the reader block");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent(document, new Event("selectionchange"));
}

describe("ReaderScreen", () => {
  beforeEach(async () => {
    await deleteVedabaseDb(userId);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteVedabaseDb(userId);
  });

  it("restores the last position, navigates chapters, and safely renders fields", async () => {
    await seedReader({ withProgress: true });
    const onNavigate = vi.fn();
    const view = render(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="chapter-1"
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Chapter One" })).toBeInTheDocument();
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
    expect(screen.getByText("Restored reading position.")).toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("heading", { name: "First unit" }).closest("article")!);
    await waitFor(async () => {
      const database = await openVedabaseDb(userId);
      const progress = await database.get("progress", bookSlug);
      const mutations = await database.getAll("mutationQueue");
      database.close();
      expect(progress?.payload).toEqual(
        expect.objectContaining({
          locator: expect.objectContaining({ unitId: "unit-1" }),
        }),
      );
      expect(mutations.some((mutation) => mutation.entity === "progress")).toBe(true);
    });

    await userEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(onNavigate).toHaveBeenCalledWith("chapter-2");
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeDisabled();

    view.rerender(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="chapter-2"
        onNavigate={onNavigate}
      />,
    );
    await screen.findByRole("heading", { name: "Chapter Two" });
    await userEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(onNavigate).toHaveBeenLastCalledWith("chapter-1");
  });

  it("shows an offline message when the local chapter is unavailable", async () => {
    await seedReader();
    render(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="missing"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This chapter is not available offline",
    );
  });

  it("persists reader preferences and toggles a bookmark locally first", async () => {
    await seedReader();
    const user = userEvent.setup();
    render(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="chapter-1"
      />,
    );
    await screen.findByRole("heading", { name: "Chapter One" });

    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(document.querySelector('[data-reader-theme="dark"]')).toHaveClass(
      "dark",
      "bg-zinc-950",
      "text-zinc-100",
    );

    await user.selectOptions(screen.getByLabelText("Theme"), "sepia");
    await user.click(screen.getByRole("button", { name: "Increase font size" }));
    await user.selectOptions(screen.getByLabelText("Line width"), "wide");
    await user.click(screen.getByRole("button", { name: "Add bookmark" }));

    await waitFor(async () => {
      const database = await openVedabaseDb(userId);
      const preference = await database.get("preferences", "reader");
      const bookmarks = await database.getAll("bookmarks");
      const mutations = await database.getAll("mutationQueue");
      database.close();
      expect(preference?.value).toEqual({
        theme: "sepia",
        fontSize: 19,
        lineWidth: "wide",
      });
      expect(bookmarks).toHaveLength(1);
      expect(mutations.some((mutation) => mutation.entity === "bookmark")).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Remove bookmark" }));
    await waitFor(async () => {
      const database = await openVedabaseDb(userId);
      const bookmark = (await database.getAll("bookmarks"))[0];
      database.close();
      expect(bookmark?.payload).toEqual(
        expect.objectContaining({ deletedAt: expect.any(String) }),
      );
    });
  });

  it("turns a selection into a highlight and supports note editing", async () => {
    await seedReader();
    const user = userEvent.setup();
    render(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="chapter-1"
      />,
    );
    await screen.findByRole("heading", { name: "Chapter One" });

    selectText("block-unit-1-translationHtml", 0, 4);
    await user.click(screen.getByRole("button", { name: "Highlight selection" }));
    selectText("block-unit-1-translationHtml", 5, 11);
    await user.click(screen.getByRole("button", { name: "Add note to selection" }));
    await user.type(screen.getByLabelText("Note text"), "Initial note");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Initial note")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Initial note" }));
    await user.clear(screen.getByLabelText("Note text"));
    await user.type(screen.getByLabelText("Note text"), "Edited note");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(async () => {
      const database = await openVedabaseDb(userId);
      const annotations = await database.getAll("annotations");
      const mutations = await database.getAll("mutationQueue");
      database.close();
      expect(annotations).toHaveLength(2);
      expect(annotations.map((item) => item.payload)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "highlight", color: "yellow" }),
          expect.objectContaining({ kind: "note", noteText: "Edited note" }),
        ]),
      );
      expect(mutations.filter((mutation) => mutation.entity === "annotation")).toHaveLength(3);
    });
  });

  it("searches intersected local postings and navigates to a plain-text result", async () => {
    await seedReader();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <ReaderScreen
        userId={userId}
        bookSlug={bookSlug}
        chapterSlug="chapter-1"
        onNavigate={onNavigate}
      />,
    );
    await screen.findByRole("heading", { name: "Chapter One" });

    await user.click(screen.getByRole("button", { name: "Search downloaded books" }));
    await user.type(screen.getByLabelText("Search query"), "act attachment");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const result = await screen.findByRole("button", { name: /Detached action/ });
    expect(result).toHaveTextContent("Act without attachment and remain steady.");
    expect(result.innerHTML).not.toContain("<p>");
    await user.click(result);
    expect(onNavigate).toHaveBeenCalledWith("chapter-2", "unit-3");
  });
});

describe("reader locator serialization", () => {
  it("uses a deterministic property order for locators and ranges", () => {
    const locator: VedabaseLocator = {
      unitId: "unit-1",
      chapterSlug: "chapter-1",
      bookSlug,
      end: 9,
      start: 2,
      block: "translationHtml",
    };

    expect(serializeLocator(locator)).toBe(
      '{"bookSlug":"book-one","chapterSlug":"chapter-1","unitId":"unit-1","block":"translationHtml","start":2,"end":9}',
    );
    expect(
      serializeTextRange({
        quote: "ga acti",
        end: 9,
        start: 2,
        block: "translationHtml",
      }),
    ).toBe(
      '{"block":"translationHtml","start":2,"end":9,"quote":"ga acti"}',
    );
  });
});
