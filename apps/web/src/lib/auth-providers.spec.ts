import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthProviders } from "./auth-providers";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "vedamatch.ru" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAuthProviders", () => {
  it("отдаёт список в порядке сервера", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: ["yandex", "google"] }),
      }),
    );

    await expect(getAuthProviders()).resolves.toEqual(["yandex", "google"]);
  });

  it("передаёт домен портала, а не внутренний адрес API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ providers: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getAuthProviders();

    expect(fetchMock.mock.calls[0][0]).toContain("host=vedamatch.ru");
  });

  it("отбрасывает неизвестные значения", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: ["google", "telepathy"] }),
      }),
    );

    await expect(getAuthProviders()).resolves.toEqual(["google"]);
  });

  it("при недоступном API оставляет вход рабочим", async () => {
    // Страница входа без единой кнопки — это отказ в обслуживании.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет связи")));

    await expect(getAuthProviders()).resolves.toEqual(["google"]);
  });

  it("при ошибке ответа — тоже", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(getAuthProviders()).resolves.toEqual(["google"]);
  });
});
