import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryEntryDto } from "@vedamatch/shared";
import { EntryCard } from "./entry-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const entry: LibraryEntryDto = {
  id: "entry-1",
  url: "https://example.com/a",
  domain: "example.com",
  source: null,
  type: "video",
  contentLanguage: "ru",
  titleRu: "Лекция по Гите",
  titleEn: null,
  descriptionRu: "Разбор второй главы",
  descriptionEn: null,
  faviconUrl: null,
  previewUrl: null,
  status: "published",
  usefulCount: 4,
  uniqueClickCount: 11,
  bookmarkCount: 2,
  commentsCount: 3,
  bookmarked: false,
  publishedAt: "2026-07-29T10:00:00.000Z",
  categories: [
    {
      id: "category-1",
      slug: "gita",
      sectionSlug: "philosophy",
      titleRu: "Гита",
      titleEn: null,
    },
  ],
  addedBy: { id: "user-1", name: "Тест" },
  canEdit: false,
  hasCustomPreview: false,
};

describe("EntryCard", () => {
  it("renders the localized title, domain and type badge", () => {
    render(<EntryCard entry={entry} locale="ru" />);

    expect(screen.getByText("Лекция по Гите")).toBeDefined();
    expect(screen.getByText("example.com")).toBeDefined();
    expect(screen.getByText("Видео")).toBeDefined();
  });

  it("falls back to the russian title in english locale", () => {
    render(<EntryCard entry={entry} locale="en" />);

    expect(screen.getByText("Лекция по Гите")).toBeDefined();
    expect(screen.getByText("Video")).toBeDefined();
  });

  it("sends a video cover to our own player page", () => {
    render(
      <EntryCard
        entry={{
          ...entry,
          url: "https://www.youtube.com/watch?v=OXDrvBwIHLg",
          previewUrl: "https://cdn.vedamatch.ru/library/previews/entry-1.webp",
        }}
        locale="ru"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Смотреть здесь" }).getAttribute("href"),
    ).toBe("/library/entry/entry-1");
  });

  it("keeps a non-video cover pointing at the source", () => {
    render(
      <EntryCard
        entry={{
          ...entry,
          previewUrl: "https://cdn.vedamatch.ru/library/previews/entry-1.webp",
        }}
        locale="ru"
      />,
    );

    const cover = screen.getByAltText("Обложка материала").closest("a");
    expect(cover?.getAttribute("href")).toBe("https://example.com/a");
  });

  it("opens the external url in a new tab", () => {
    render(<EntryCard entry={entry} locale="ru" />);
    const link = screen.getByRole("link", { name: /Лекция по Гите/ });

    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("hides edit and delete from a reader", () => {
    render(<EntryCard entry={entry} locale="ru" />);

    expect(screen.queryByRole("button", { name: /удалить/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /редактировать/i })).toBeNull();
  });

  it("offers edit and delete to the author or an admin", () => {
    render(<EntryCard entry={{ ...entry, canEdit: true }} locale="ru" />);

    expect(screen.getByRole("button", { name: /удалить/i })).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: /редактировать/i })
        .getAttribute("href"),
    ).toBe("/library/entry/entry-1");
  });
});
