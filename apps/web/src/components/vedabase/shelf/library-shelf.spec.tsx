import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { VedabaseBookManifest } from "@vedamatch/shared";
import { LibraryShelf } from "./library-shelf";

vi.mock("@/lib/vedabase/local-db", () => ({
  openVedabaseDb: () => Promise.reject(new Error("нет IndexedDB")),
}));

function book(
  slug: string,
  title: string,
  audienceStages: string[] = [],
): VedabaseBookManifest {
  return {
    slug,
    title,
    audienceStages,
    author: "А. Ч. Бхактиведанта Свами Прабхупада",
    chapters: [{ slug: "c1", title: "Глава 1", order: 1, file: "c1.json" }],
  } as VedabaseBookManifest;
}

const books = [
  book("bhagavad-gita", "Бхагавад-гита как она есть"),
  book("chaitanya-charitamrita", "Шри Чайтанья-чаритамрита", ["devotee"]),
];

/* VED-662: полка Библиотеки. */
describe("LibraryShelf", () => {
  it("книги ведут в первую главу, внизу — панель из четырёх действий", () => {
    render(
      <LibraryShelf
        userId="u1"
        books={books}
        initialFilters={{ stages: [], lineages: [] }}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Бхагавад-гита/ }).getAttribute("href"),
    ).toBe("/vedabase/books/bhagavad-gita/c1");
    const dock = screen.getByRole("navigation", { name: "Панель библиотеки" });
    // VED-677: «Кто я» и «Линия» — в «Фильтрах», «Викторина» — в «Настройках».
    expect(
      [...dock.querySelectorAll("button")].map((button) => button.textContent),
    ).toEqual(["Закладки", "Поиск", "Фильтры", "Настройки"]);
  });

  it("фильтр портала сразу сужает полку, «Показать все» его снимает", () => {
    render(
      <LibraryShelf
        userId="u1"
        books={books}
        initialFilters={{ stages: ["seeker"], lineages: [] }}
      />,
    );
    expect(screen.queryByRole("link", { name: /Чайтанья/ })).toBeNull();
    expect(screen.getByText("1 из 2 по вашему выбору")).toBeTruthy();
  });

  it("пустой выбор — предложение показать все книги", () => {
    render(
      <LibraryShelf
        userId="u1"
        books={[books[1]]}
        initialFilters={{ stages: ["seeker"], lineages: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Показать все книги" }));
    expect(screen.getByRole("link", { name: /Чайтанья/ })).toBeTruthy();
  });
});
