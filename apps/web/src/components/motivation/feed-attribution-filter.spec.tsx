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

  // VED-252: значок встаёт в ряд вкладок — подписи «Автор и источник» нет
  // ни в активном, ни в неактивном состоянии, только aria-label и точка.
  it("без выбранного фильтра — только значок, подписи нет", () => {
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);

    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });
    expect(trigger).toHaveTextContent("");
    expect(screen.queryByText("Автор и источник")).not.toBeInTheDocument();
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
    const trigger = screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" });
    expect(trigger).toBeTruthy();
    // Активный фильтр отмечен точкой на значке (VED-252) — тем же приёмом,
    // что активная вкладка отмечена цветом, а не подписью на кнопке.
    expect(trigger.querySelector(".bg-magenta")).toBeInTheDocument();
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
