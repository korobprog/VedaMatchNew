import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryBookmarksDialog } from "./bookmarks-dialog";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(items: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ items }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LibraryBookmarksDialog", () => {
  it("opens the list of bookmarked materials with links", async () => {
    const fetchMock = respond([
      {
        id: "e1",
        type: "article",
        titleRu: "Как слушать лекции Шрилы Прабхупады каждый день",
        titleEn: null,
        bookmarkedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        id: "e2",
        type: "katha",
        titleRu: "Катха о терпении",
        titleEn: null,
        bookmarkedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    render(<LibraryBookmarksDialog locale="ru" />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Закладки" }));

    const dialog = screen.getByRole("dialog", { name: "Мои закладки" });
    expect(dialog).toBeDefined();
    const link = await screen.findByRole("link", {
      name: "Как слушать лекции Шрилы Прабхупады каждый день",
    });
    expect(link.getAttribute("href")).toBe("/library/entry/e1");
    expect(
      screen
        .getByRole("link", { name: "Катха о терпении" })
        .getAttribute("href"),
    ).toBe("/library/entry/e2");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/library\/bookmarks$/);
  });

  it("says so when nothing is bookmarked", async () => {
    respond([]);
    render(<LibraryBookmarksDialog locale="ru" />);

    await userEvent.click(screen.getByRole("button", { name: "Закладки" }));

    expect(await screen.findByText(/Закладок пока нет/)).toBeDefined();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("reports a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    render(<LibraryBookmarksDialog locale="ru" />);

    await userEvent.click(screen.getByRole("button", { name: "Закладки" }));

    expect(
      await screen.findByText("Не удалось загрузить закладки"),
    ).toBeDefined();
  });

  it("closes on Escape and returns focus to the button", async () => {
    respond([]);
    render(<LibraryBookmarksDialog locale="ru" />);
    const trigger = screen.getByRole("button", { name: "Закладки" });

    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Закрыть" }),
      );
    });
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
