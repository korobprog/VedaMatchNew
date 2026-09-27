import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryShlokaSourceLinesResponse } from "@vedamatch/shared";
import { ShlokaFolderList } from "./shloka-folder-list";

const data: LibraryShlokaSourceLinesResponse = {
  category: { id: "c", slug: "shloki", titleRu: "Шлоки", titleEn: null },
  folder: { key: "бхагавад-гита", label: "Бхагавад-гита", count: 3 },
  items: [
    {
      id: "s1",
      verse: "2.13",
      line: "dehino ’smin yathā dehe",
      lineFrom: "text",
      canEdit: true,
    },
    {
      id: "s2",
      verse: "2.62-63",
      line: "Созерцая объекты чувств…",
      lineFrom: "translation",
      canEdit: false,
    },
    { id: "s3", verse: null, line: "стих", lineFrom: "text", canEdit: false },
  ],
};

describe("ShlokaFolderList", () => {
  it("одна строка на шлоку: номер и первая строка, ссылка на шлоку", () => {
    render(<ShlokaFolderList locale="ru" categorySlug="shloki" data={data} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Бхагавад-гита\s*3 шлоки/,
      }),
    ).toBeInTheDocument();
    const rows = within(
      screen.getByRole("list", { name: "Шлоки источника" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    const first = within(rows[0]).getAllByRole("link");
    expect(first[0]).toHaveAttribute("href", "/library/entry/s1");
    expect(first[0]).toHaveTextContent("2.13dehino ’smin yathā dehe");
    // Диапазон — с неразрывным дефисом, чтобы номер не рвался.
    expect(rows[1]).toHaveTextContent("2.62‑63");
    expect(rows[2]).toHaveTextContent("б/нстих");
  });

  it("карандаш — только у тех, кому шлоку можно править, и ведёт в правку", () => {
    render(<ShlokaFolderList locale="ru" categorySlug="shloki" data={data} />);

    const edits = screen.getAllByRole("link", { name: /^Править шлоку/ });
    expect(edits).toHaveLength(1);
    expect(edits[0]).toHaveAccessibleName("Править шлоку 2.13");
    expect(edits[0]).toHaveAttribute("href", "/library/entry/s1?mode=edit");
  });

  it("назад — к папкам рубрики, «Добавить» — с источником папки", () => {
    render(<ShlokaFolderList locale="ru" categorySlug="shloki" data={data} />);

    expect(screen.getByRole("link", { name: "Все источники" })).toHaveAttribute(
      "href",
      "/library/shloki",
    );
    expect(
      screen.getByRole("link", { name: "Добавить шлоку" }),
    ).toHaveAttribute(
      "href",
      `/library/add/shloka?category=shloki&source=${encodeURIComponent("Бхагавад-гита")}`,
    );
  });
});
