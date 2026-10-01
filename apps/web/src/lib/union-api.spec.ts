import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUnionRecommendations, toQueryString } from "./union-api";

/* Запрос уходит от серверной страницы с cookie доступа. */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token" }) }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("toQueryString", () => {
  it("repeats a parameter given several values", () => {
    expect(toQueryString({ intentions: ["family", "service"] })).toBe(
      "?intentions=family&intentions=service",
    );
  });

  it("keeps a single value as it was", () => {
    expect(toQueryString({ city: "Москва" })).toBe(
      `?city=${encodeURIComponent("Москва")}`,
    );
  });

  it("returns an empty string without parameters", () => {
    expect(toQueryString({})).toBe("");
  });
});

/* VED-673: «Показывать по 100» показывало двенадцать. Селект показывает сто
   по умолчанию, а в адресе pageSize нет — запрос уходил без него, и API
   отдавал свою двенадцать. Фактический размер должен уходить всегда. */
describe("getUnionRecommendations: размер страницы", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0 }),
    } as never);
  });

  const requestedUrl = () => String(fetchMock.mock.calls.at(-1)?.[0]);

  it("без pageSize в адресе уходит сто — как показано в селекте", async () => {
    await getUnionRecommendations({ stage: "devotee" });

    expect(requestedUrl()).toContain("pageSize=100");
    expect(requestedUrl()).toContain("stage=devotee");
  });

  it("явно выбранный размер уходит как выбран", async () => {
    await getUnionRecommendations({ pageSize: "12" });

    expect(requestedUrl()).toContain("pageSize=12");
  });

  it("мусор в адресе не превращается в «показать 5000 анкет»", async () => {
    await getUnionRecommendations({ pageSize: "5000" });

    expect(requestedUrl()).toContain("pageSize=100");
  });
});
