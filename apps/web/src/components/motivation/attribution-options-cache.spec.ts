import { afterEach, describe, expect, it, vi } from "vitest";
import type { MotivationFeedAttributionsDto } from "@vedamatch/shared";
import {
  TTL_MS,
  cachedAttributions,
  loadAttributions,
  resetAttributionsCache,
} from "./attribution-options-cache";

afterEach(() => resetAttributionsCache());

const gita: MotivationFeedAttributionsDto = {
  works: [{ label: "Бхагавад-гита", count: 6 }],
  speakers: [{ label: "Кришна", count: 4 }],
};
const cards: MotivationFeedAttributionsDto = {
  works: [{ label: "Шримад-Бхагаватам", count: 2 }],
  speakers: [],
};

describe("кэш списков автора и источника", () => {
  it("до запроса памяти нет, после — есть", async () => {
    expect(cachedAttributions("style=art")).toBeNull();

    await loadAttributions("style=art", async () => gita);

    expect(cachedAttributions("style=art")).toEqual(gita);
  });

  it("второе открытие берёт из памяти и в сеть не ходит", async () => {
    const fetcher = vi.fn(async () => gita);

    expect(await loadAttributions("style=art", fetcher)).toEqual(gita);
    expect(await loadAttributions("style=art", fetcher)).toEqual(gita);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // Наведение, касание и само открытие идут подряд за доли секунды —
  // это один поход в сеть, а не три.
  it("одновременные вызовы делят один запрос", async () => {
    let resolve: (value: MotivationFeedAttributionsDto) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<MotivationFeedAttributionsDto>((done) => (resolve = done)),
    );

    const first = loadAttributions("style=art", fetcher);
    const second = loadAttributions("style=art", fetcher);
    resolve(gita);

    expect(await first).toEqual(gita);
    expect(await second).toEqual(gita);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // Папка и вкладка сужают списки: список «Открыток» в «Ленте» показывать
  // нельзя, поэтому ключ — вся строка запроса.
  it("разные запросы — разные списки", async () => {
    await loadAttributions("style=art", async () => gita);
    await loadAttributions("style=cards", async () => cards);

    expect(cachedAttributions("style=art")).toEqual(gita);
    expect(cachedAttributions("style=cards")).toEqual(cards);
  });

  it("ошибка не запоминается: следующее открытие пробует снова", async () => {
    const fetcher = vi
      .fn<AttributionsFetcherLike>()
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce(gita);

    expect(await loadAttributions("style=art", fetcher)).toBeNull();
    expect(cachedAttributions("style=art")).toBeNull();
    expect(await loadAttributions("style=art", fetcher)).toEqual(gita);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("через TTL список считается устаревшим и запрашивается заново", async () => {
    const fetcher = vi.fn(async () => gita);
    let now = 1_000;
    const clock = () => now;

    await loadAttributions("style=art", fetcher, clock);
    now += TTL_MS - 1;
    expect(cachedAttributions("style=art", clock)).toEqual(gita);
    await loadAttributions("style=art", fetcher, clock);
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 1;
    expect(cachedAttributions("style=art", clock)).toBeNull();
    await loadAttributions("style=art", fetcher, clock);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

type AttributionsFetcherLike = (query: string) => Promise<MotivationFeedAttributionsDto>;
