import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./motivation-admin-api";

function stubFetch(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiRequest", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns null for the empty 200 Nest sends from a void handler", async () => {
    // Именно этот случай ломал удаление: код 200, тело пустое, .json() падал.
    stubFetch({ ok: true, status: 200, text: async () => "" });

    await expect(apiRequest("/admin/motivation/posts/p1", "DELETE")).resolves.toBeNull();
  });

  it("returns null for a 204 without a body", async () => {
    stubFetch({ ok: true, status: 204, text: async () => "" });

    await expect(apiRequest("/admin/motivation/authors/a1", "DELETE")).resolves.toBeNull();
  });

  it("parses a JSON body when there is one", async () => {
    stubFetch({ ok: true, status: 200, text: async () => '{"foundCount":3}' });

    await expect(apiRequest("/admin/motivation/authors/a1/search", "POST")).resolves.toEqual(
      { foundCount: 3 },
    );
  });

  it("surfaces the server's message on a failure", async () => {
    stubFetch({
      ok: false,
      status: 400,
      text: async () => "The default category cannot be deleted",
    });

    await expect(apiRequest("/admin/motivation/categories/c1", "DELETE")).rejects.toThrow(
      "The default category cannot be deleted",
    );
  });

  it("falls back to the status code when the failure has no body", async () => {
    stubFetch({ ok: false, status: 500, text: async () => "" });

    await expect(apiRequest("/admin/motivation/posts/p1", "DELETE")).rejects.toThrow(
      "Ошибка API 500",
    );
  });

  it("sends a JSON body only when there is one", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, text: async () => "" });

    await apiRequest("/admin/motivation/posts/p1", "DELETE");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });

    await apiRequest("/admin/motivation/categories", "POST", { title: "Вера" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { "content-type": "application/json" },
      body: '{"title":"Вера"}',
    });
  });
});

describe("apiRequest: протухший токен", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("на 401 обновляет токен и повторяет запрос один раз", async () => {
    // Токен доступа живёт недолго, а админ сидит на одной странице часами.
    // SilentRefresh срабатывает только на лендинге, поэтому без этого повтора
    // кнопки отвечали «Требуется авторизация», хотя сессия ещё жива.
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/auth/refresh"))
          return { ok: true, status: 201, text: async () => "" };
        return calls.filter((c) => c.endsWith("/target")).length === 1
          ? { ok: false, status: 401, text: async () => "Требуется авторизация" }
          : { ok: true, status: 200, text: async () => '{"ok":true}' };
      }),
    );

    await expect(apiRequest("/target", "POST")).resolves.toEqual({ ok: true });
    expect(calls.filter((c) => c.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((c) => c.endsWith("/target"))).toHaveLength(2);
  });

  it("если обновить не удалось — отдаёт ошибку, а не крутит запросы по кругу", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: false, status: 401, text: async () => "Требуется авторизация" };
      }),
    );

    await expect(apiRequest("/target", "POST")).rejects.toThrow(
      "Требуется авторизация",
    );
    expect(calls.filter((c) => c.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((c) => c.endsWith("/target"))).toHaveLength(1);
  });

  it("удачный запрос токен не трогает", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }),
    );

    await apiRequest("/target", "POST");

    expect(calls.some((c) => c.endsWith("/auth/refresh"))).toBe(false);
  });
});
