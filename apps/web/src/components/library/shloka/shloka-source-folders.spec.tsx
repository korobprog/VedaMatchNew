import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryShlokaSourcesResponse } from "@vedamatch/shared";
import { ShlokaSourceFolders } from "./shloka-source-folders";

const sources: LibraryShlokaSourcesResponse = {
  category: { id: "c", slug: "shloki", titleRu: "Шлоки", titleEn: null },
  total: 8,
  folders: [
    { key: "бхагавад-гита", label: "Бхагавад-гита", count: 5 },
    { key: "шримад-бхагаватам", label: "Шримад-Бхагаватам", count: 2 },
    { key: "_", label: null, count: 1 },
  ],
};

describe("ShlokaSourceFolders", () => {
  it("папка на источник с числом шлок, ссылка — в папку", () => {
    render(
      <ShlokaSourceFolders
        locale="ru"
        categorySlug="shloki"
        sources={sources}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /Источники\s*8 шлок/ }),
    ).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("link");
    expect(items.map((link) => link.textContent)).toEqual([
      "Бхагавад-гита, 5 шлок5",
      "Шримад-Бхагаватам, 2 шлоки2",
      "Без источника, 1 шлока1",
    ]);
    expect(items[0]).toHaveAttribute(
      "href",
      `/library/shloki?source=${encodeURIComponent("бхагавад-гита")}`,
    );
    expect(items[2]).toHaveAttribute("href", "/library/shloki?source=_");
    expect(
      screen.getByRole("link", { name: "Добавить шлоку" }),
    ).toHaveAttribute("href", "/library/add/shloka?category=shloki");
  });

  it("без шлок — подсказка вместо пустого списка", () => {
    render(
      <ShlokaSourceFolders
        locale="en"
        categorySlug="shloki"
        sources={{ ...sources, total: 0, folders: [] }}
      />,
    );
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(/No shlokas yet/)).toBeInTheDocument();
  });
});
