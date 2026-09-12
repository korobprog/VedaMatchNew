import { describe, expect, it } from "vitest";
import { resolveApiBase } from "./api-base";

const FALLBACK = "https://api.vedamatch.ru";

describe("resolveApiBase", () => {
  it("российский контур ходит в свой API", () => {
    expect(resolveApiBase("vedamatch.ru", FALLBACK)).toBe(
      "https://api.vedamatch.ru",
    );
  });

  it("глобальный контур ходит в свой API, а не в чужой", () => {
    // Ради этого всё и затевалось: с .com запрос в api.vedamatch.ru
    // кросс-сайтовый, refresh-кука с sameSite=lax туда не уходит.
    expect(resolveApiBase("vedamatch.com", FALLBACK)).toBe(
      "https://api.vedamatch.com",
    );
  });

  it("поддомены портала ходят в API своего контура", () => {
    expect(resolveApiBase("www.vedamatch.com", FALLBACK)).toBe(
      "https://api.vedamatch.com",
    );
    expect(resolveApiBase("vaishnava.vedamatch.ru", FALLBACK)).toBe(
      "https://api.vedamatch.ru",
    );
  });

  it("регистр и пробелы не мешают", () => {
    expect(resolveApiBase("  WWW.VedaMatch.COM ", FALLBACK)).toBe(
      "https://api.vedamatch.com",
    );
  });

  it("незнакомый хост остаётся на настройке сборки", () => {
    // Превью-деплои, локальная разработка и вход по адресу сервера.
    expect(resolveApiBase("localhost", FALLBACK)).toBe(FALLBACK);
    expect(resolveApiBase("crm.64.130.62.129.sslip.io", FALLBACK)).toBe(
      FALLBACK,
    );
    expect(resolveApiBase("64.130.62.129", FALLBACK)).toBe(FALLBACK);
    expect(resolveApiBase("portal.example.org", FALLBACK)).toBe(FALLBACK);
  });

  it("сам API-домен не удваивается", () => {
    expect(resolveApiBase("api.vedamatch.com", FALLBACK)).toBe(FALLBACK);
  });

  it("пустое значение — это отсутствие значения", () => {
    expect(resolveApiBase("", FALLBACK)).toBe(FALLBACK);
    expect(resolveApiBase("   ", FALLBACK)).toBe(FALLBACK);
    expect(resolveApiBase(null, FALLBACK)).toBe(FALLBACK);
    expect(resolveApiBase(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
