import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedAttributionFilter } from "./feed-attribution-filter";

afterEach(() => vi.unstubAllGlobals());

describe("FeedAttributionFilter", () => {
  it("у избранного фильтра нет", () => {
    const { container } = render(<FeedAttributionFilter state={{ tab: "saved" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("выбранное видно чипами, крестик убирает только своё", () => {
    render(
      <FeedAttributionFilter
        state={{ tab: "cards", category: "vedy", work: "Бхагавад-гита", speaker: "Кришна" }}
      />,
    );
    const work = screen.getByRole("link", { name: "Убрать фильтр по источнику: Бхагавад-гита" });
    const query = new URL(work.getAttribute("href")!, "https://x").searchParams;
    expect(Object.fromEntries(query)).toEqual({ tab: "cards", category: "vedy", speaker: "Кришна" });
    expect(screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" })).toBeTruthy();
  });

  it("открывает список со счётчиками и отмечает выбранное", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        works: [{ label: "Бхагавад-гита", count: 6 }],
        speakers: [{ label: "Кришна", count: 4 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou", work: "бхагавад-гита" }} />);

    await user.click(screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" }));
    const dialog = await screen.findByRole("dialog", { name: "Автор и источник" });
    const gita = await within(dialog).findByRole("link", { name: /Бхагавад-гита/ });
    expect(gita.getAttribute("aria-current")).toBe("true");
    expect(gita.textContent).toContain("6");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/motivation/feed/attributions?style=art&work=",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
