import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VedabaseBookManifest, VedabaseLibraryManifest } from "@vedamatch/shared";
import type { VedabaseDownloadSnapshot } from "@/lib/vedabase/download-manager";
import { VedabaseProvider } from "./vedabase-provider";
import { LibraryScreen } from "./library-screen";

function book(index: number): VedabaseBookManifest {
  return {
    formatVersion: 1,
    slug: `book-${index}`,
    title: `Book ${index}`,
    author: index % 2 === 0 ? "Author" : null,
    language: "ru",
    contentVersion: "version-1",
    packageChecksum: "a".repeat(64),
    sizeBytes: 10,
    coverPath: null,
    sourceUrl: `https://vedabase.ru/book-${index}`,
    sourceOrigin: "https://vedabase.ru",
    importedAt: "2026-07-10T00:00:00.000Z",
    permissionRef: "permission",
    attribution: "vedabase.ru",
    chapters: [
      { slug: "chapter-1", title: "Chapter 1", order: 1, file: "one.json" },
    ],
    files: [],
  };
}

const library: VedabaseLibraryManifest = {
  formatVersion: 1,
  generatedAt: "2026-07-10T00:00:00.000Z",
  books: Array.from({ length: 15 }, (_, index) => book(index + 1)),
};

function fakeManager() {
  const snapshot: VedabaseDownloadSnapshot = {
    downloads: {
      "book-1": {
        bookSlug: "book-1",
        version: "version-1",
        status: "complete",
        downloadedBytes: 10,
        totalBytes: 10,
        error: null,
      },
      "book-2": {
        bookSlug: "book-2",
        version: "version-1",
        status: "paused",
        downloadedBytes: 5,
        totalBytes: 10,
        error: null,
      },
      "book-3": {
        bookSlug: "book-3",
        version: "version-1",
        status: "downloading",
        downloadedBytes: 2,
        totalBytes: 10,
        error: null,
      },
    },
    libraryDownload: {
      totalBooks: 15,
      completedBooks: 1,
      currentBookSlug: "book-2",
    },
  };

  return {
    downloadBook: vi.fn().mockResolvedValue(undefined),
    downloadLibrary: vi.fn().mockResolvedValue(undefined),
    getSnapshot: () => snapshot,
    initialize: vi.fn().mockResolvedValue(undefined),
    pauseBook: vi.fn(),
    removeBook: vi.fn().mockResolvedValue(undefined),
    resumeBook: vi.fn().mockResolvedValue(undefined),
    subscribe: () => () => undefined,
  };
}

function renderLibrary(manager = fakeManager()) {
  render(
    <VedabaseProvider userId="user-1" library={library} manager={manager}>
      <LibraryScreen />
    </VedabaseProvider>,
  );
  return manager;
}

describe("LibraryScreen", () => {
  it("renders 15 books and filters by title and download state", async () => {
    const user = userEvent.setup();
    renderLibrary();

    expect(screen.getAllByRole("article")).toHaveLength(15);
    await user.type(screen.getByPlaceholderText("Поиск по названию"), "Book 12");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Book 12" })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Поиск по названию"));
    await user.click(screen.getByRole("button", { name: "Скачанные" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Book 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Начатые" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Book 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Book 3" })).toBeInTheDocument();
  });

  it("shows progress and invokes download, resume, pause, remove, and download-all", async () => {
    const user = userEvent.setup();
    const manager = renderLibrary();

    expect(screen.getByText("Всего: 150 Б")).toBeInTheDocument();
    expect(screen.getByText("1 из 15 книг")).toBeInTheDocument();
    expect(screen.getByText("Пауза · 50%")).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId("book-card-book-4")).getByRole("button", {
        name: "Скачать",
      }),
    );
    await user.click(
      within(screen.getByTestId("book-card-book-2")).getByRole("button", {
        name: "Продолжить",
      }),
    );
    await user.click(
      within(screen.getByTestId("book-card-book-3")).getByRole("button", {
        name: "Пауза",
      }),
    );
    await user.click(
      within(screen.getByTestId("book-card-book-1")).getByRole("button", {
        name: "Удалить с устройства",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Скачать всю библиотеку" }));

    expect(manager.downloadBook).toHaveBeenCalledWith("book-4");
    expect(manager.resumeBook).toHaveBeenCalledWith("book-2");
    expect(manager.pauseBook).toHaveBeenCalledWith("book-3");
    expect(manager.removeBook).toHaveBeenCalledWith("book-1");
    expect(manager.downloadLibrary).toHaveBeenCalledWith(library);
  });

  it("updates the visible offline status", () => {
    renderLibrary();
    expect(screen.getByText("В сети")).toBeInTheDocument();

    fireEvent(window, new Event("offline"));

    expect(screen.getByText("Офлайн")).toBeInTheDocument();
  });
});
