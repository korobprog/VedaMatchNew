import { beforeEach, describe, expect, it } from "vitest";
import {
  STREAM_URL_CACHE_LIMIT,
  STREAM_URL_SAFETY_MARGIN_MS,
  clearStreamUrlCache,
  forgetStreamUrl,
  freshStreamUrl,
  hasCachedStreamUrl,
  isStreamUrlUsable,
  rememberStreamUrl,
  streamUrlExpiresAt,
} from "./stream-url-cache";

const NOW = 1_700_000_000_000;
const SIX_HOURS = 6 * 60 * 60;

beforeEach(() => {
  clearStreamUrlCache();
});

describe("streamUrlExpiresAt", () => {
  it("считает срок в миллисекундах от текущего момента", () => {
    expect(streamUrlExpiresAt(SIX_HOURS, NOW)).toBe(NOW + 6 * 60 * 60 * 1000);
  });
});

describe("isStreamUrlUsable", () => {
  it("отсутствующий адрес не годится", () => {
    expect(isStreamUrlUsable(undefined, NOW)).toBe(false);
  });

  it("свежий адрес годится", () => {
    const entry = { url: "https://s3/x", expiresAtMs: NOW + 6 * 60 * 60 * 1000 };
    expect(isStreamUrlUsable(entry, NOW)).toBe(true);
  });

  it("истёкший адрес не годится", () => {
    const entry = { url: "https://s3/x", expiresAtMs: NOW - 1 };
    expect(isStreamUrlUsable(entry, NOW)).toBe(false);
  });

  it("запаса меньше отступа не хватает: длинная запись оборвётся на середине", () => {
    const entry = {
      url: "https://s3/x",
      expiresAtMs: NOW + STREAM_URL_SAFETY_MARGIN_MS - 1000,
    };
    expect(isStreamUrlUsable(entry, NOW)).toBe(false);
  });
});

describe("freshStreamUrl", () => {
  it("возвращает положенный адрес", () => {
    rememberStreamUrl("a", "https://s3/a", SIX_HOURS, NOW);
    expect(freshStreamUrl("a", NOW)).toBe("https://s3/a");
  });

  it("про незнакомую запись отвечает null", () => {
    expect(freshStreamUrl("нет такой", NOW)).toBeNull();
  });

  it("протухшее не отдаёт и выбрасывает из запаса", () => {
    rememberStreamUrl("a", "https://s3/a", SIX_HOURS, NOW);
    const later = NOW + 7 * 60 * 60 * 1000;

    expect(freshStreamUrl("a", later)).toBeNull();
    // Иначе про один и тот же протухший адрес спрашивали бы вечно.
    expect(hasCachedStreamUrl("a")).toBe(false);
  });
});

describe("rememberStreamUrl", () => {
  it("перезапись обновляет срок", () => {
    rememberStreamUrl("a", "https://s3/старый", SIX_HOURS, NOW);
    const later = NOW + 5 * 60 * 60 * 1000;
    rememberStreamUrl("a", "https://s3/новый", SIX_HOURS, later);

    expect(freshStreamUrl("a", later)).toBe("https://s3/новый");
  });

  it("вытесняет самое давнее, когда запас переполнен", () => {
    for (let i = 0; i <= STREAM_URL_CACHE_LIMIT; i += 1) {
      rememberStreamUrl(`t${i}`, `https://s3/t${i}`, SIX_HOURS, NOW);
    }

    expect(hasCachedStreamUrl("t0")).toBe(false);
    expect(hasCachedStreamUrl(`t${STREAM_URL_CACHE_LIMIT}`)).toBe(true);
  });

  it("повторное сохранение отодвигает запись от вытеснения", () => {
    for (let i = 0; i < STREAM_URL_CACHE_LIMIT; i += 1) {
      rememberStreamUrl(`t${i}`, `https://s3/t${i}`, SIX_HOURS, NOW);
    }
    rememberStreamUrl("t0", "https://s3/t0", SIX_HOURS, NOW);
    rememberStreamUrl("новая", "https://s3/новая", SIX_HOURS, NOW);

    expect(hasCachedStreamUrl("t0")).toBe(true);
    expect(hasCachedStreamUrl("t1")).toBe(false);
  });
});

describe("forgetStreamUrl", () => {
  it("убирает адрес, по которому не заиграло", () => {
    rememberStreamUrl("a", "https://s3/a", SIX_HOURS, NOW);
    forgetStreamUrl("a");
    expect(freshStreamUrl("a", NOW)).toBeNull();
  });
});
