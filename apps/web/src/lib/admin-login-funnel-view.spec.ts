import { describe, expect, it } from "vitest";
import type { AdminLoginStats } from "@vedamatch/shared";
import { buildLoginFunnelTable, formatReturnRate } from "./admin-login-funnel-view";

const STATS: AdminLoginStats = {
  last7Days: [
    { client: "site", logins: 10, users: 8 },
    { client: "telegram", logins: 3, users: 3 },
  ],
  last30Days: [
    { client: "site", logins: 40, users: 20 },
    { client: "web-app", logins: 5, users: 4 },
    { client: "telegram", logins: 9, users: 6 },
    { client: "android", logins: 2, users: 2 },
  ],
  return7Day: [
    { client: "site", cohortSize: 10, returnedCount: 3, returnRate: 0.3 },
    { client: "telegram", cohortSize: 0, returnedCount: 0, returnRate: null },
  ],
};

describe("buildLoginFunnelTable", () => {
  it("возвращает все четыре источника в фиксированном порядке", () => {
    const table = buildLoginFunnelTable(STATS);
    expect(table.map((row) => row.client)).toEqual([
      "site",
      "web-app",
      "telegram",
      "android",
    ]);
  });

  it("подставляет нули для источника без данных за период", () => {
    const table = buildLoginFunnelTable(STATS);
    const webApp = table.find((row) => row.client === "web-app");
    expect(webApp).toMatchObject({ logins7: 0, users7: 0, logins30: 5, users30: 4 });
  });

  it("округляет долю возврата в целые проценты", () => {
    const table = buildLoginFunnelTable(STATS);
    const site = table.find((row) => row.client === "site");
    expect(site?.returnRatePercent).toBe(30);
  });

  it("оставляет null для источника с пустой когортой", () => {
    const table = buildLoginFunnelTable(STATS);
    const telegram = table.find((row) => row.client === "telegram");
    expect(telegram?.returnRatePercent).toBeNull();
    const android = table.find((row) => row.client === "android");
    expect(android?.returnRatePercent).toBeNull();
  });

  it("прикладывает человекочитаемую подпись источника", () => {
    const table = buildLoginFunnelTable(STATS);
    expect(table.find((row) => row.client === "site")?.label).toBe("Сайт");
  });
});

describe("formatReturnRate", () => {
  it("форматирует число процентом", () => {
    expect(formatReturnRate(30)).toBe("30%");
    expect(formatReturnRate(0)).toBe("0%");
  });

  it("возвращает прочерк для null", () => {
    expect(formatReturnRate(null)).toBe("—");
  });
});
