import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoticesFeedView } from "./notices-feed-view";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Фильтр по городу в API сравнивает точным совпадением (см.
 * notice-feed-query.ts): «Хабаро» никогда не найдёт «Хабаровск». Раньше поле
 * было голым текстом без подсказок, и человек не мог узнать, какую именно
 * строку ждёт фильтр, — с любым текстом кроме точного город выглядел
 * несуществующим. Эти тесты проверяют, что поле теперь предлагает подсказки
 * геокодера и фильтрует только тем, что подтвердил геокодер.
 */
describe("NoticesFeedView: фильтр по городу", () => {
  function mockFetch() {
    return vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/notices/rubrics")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [] }),
        });
      }
      if (url.includes("/geo/search")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              city: "Хабаровск",
              country: "Россия",
              lat: 48.4813,
              lon: 135.0763,
              displayName: "Хабаровск, Хабаровский край, Россия",
            },
          ],
        });
      }
      if (url.includes("/notices")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], nextCursor: null }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it("предлагает город из геокодера, а не молчит после ввода", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NoticesFeedView />);
    await user.type(screen.getByPlaceholderText("Город"), "Хабаро");

    expect(
      await screen.findByRole("button", { name: /Хабаровск/ }),
    ).toBeInTheDocument();
  });

  it("фильтрует ленту только после выбора подсказки, не по каждой букве", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NoticesFeedView />);
    await user.type(screen.getByPlaceholderText("Город"), "Хабаро");
    await screen.findByRole("button", { name: /Хабаровск/ });

    const feedCallsBeforePick = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("city="),
    );
    expect(feedCallsBeforePick).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Хабаровск/ }));

    const feedCallsAfterPick = await vi.waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("city="),
      );
      expect(calls.length).toBeGreaterThan(0);
      return calls;
    });
    expect(String(feedCallsAfterPick.at(-1)?.[0])).toContain(
      `city=${encodeURIComponent("Хабаровск")}`,
    );
  });

  it("снимает фильтр, когда правят текст после выбора подсказки", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NoticesFeedView />);
    await user.type(screen.getByPlaceholderText("Город"), "Хабаровск");
    await user.click(
      await screen.findByRole("button", { name: /Хабаровск/ }),
    );
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("city=")),
      ).toBe(true);
    });

    fetchMock.mockClear();
    // Дописали букву — прежний точный выбор больше не соответствует тому,
    // что видно в поле, и фильтровать по нему дальше было бы обманом.
    await user.type(screen.getByPlaceholderText("Город"), "1");

    await vi.waitFor(() => {
      // Лента, а не рубрики (/notices/rubrics) и не подсказки (/geo/search).
      const feedCalls = fetchMock.mock.calls.filter(([input]) => {
        const url = String(input);
        return (
          (url.includes(`${API_URL}/notices?`) || url.endsWith(`${API_URL}/notices`)) &&
          !url.includes("/notices/rubrics")
        );
      });
      expect(feedCalls.length).toBeGreaterThan(0);
      expect(String(feedCalls.at(-1)?.[0])).not.toContain("city=");
    });
  });
});
