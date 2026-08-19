import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  SESSION_EXPIRED_EVENT,
  apiFetch,
  apiRequest,
} from "./http-client";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("на 401 делает refresh и повторяет запрос", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200)) // /auth/refresh
      .mockResolvedValueOnce(response(200, { ok: true }));

    const res = await apiFetch(`${API_URL}/notices`);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/auth/refresh`);
    // credentials подставляются даже без init
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("параллельные 401 делят один refresh", async () => {
    let refreshCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return new Promise((resolve) =>
          setTimeout(() => resolve(response(200)), 5),
        );
      }
      // Первый вызов каждого пути — 401, повтор — 200.
      seen[url] = (seen[url] ?? 0) + 1;
      return Promise.resolve(seen[url] === 1 ? response(401) : response(200));
    });
    const seen: Record<string, number> = {};

    const results = await Promise.all([
      apiFetch(`${API_URL}/a`),
      apiFetch(`${API_URL}/b`),
      apiFetch(`${API_URL}/c`),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it("если refresh не помог — отдаёт 401 и шлёт событие о конце сессии", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(401)); // refresh
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    const res = await apiFetch(`${API_URL}/notices`);
    expect(res.status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("сами /auth/* эндпоинты не рефрешатся", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401));
    const res = await apiFetch(`${API_URL}/auth/logout`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("apiRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("сериализует json и достаёт текст ошибки бэкенда", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(400, { message: ["a", "b"] }));
    await expect(
      apiRequest("/x", { method: "POST", json: { q: 1 } }),
    ).rejects.toMatchObject({ status: 400, message: "a, b" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe('{"q":1}');
    expect(init.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" }),
    );
  });

  it("204 → undefined", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    await expect(apiRequest("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
