import { describe, expect, it } from "vitest";
import { buildMarketQuery, withFilter } from "./market-query";

describe("buildMarketQuery", () => {
  it("returns an empty string when there is nothing to send", () => {
    expect(buildMarketQuery()).toBe("");
    expect(buildMarketQuery({})).toBe("");
  });

  it("keeps only the known filter keys", () => {
    const query = buildMarketQuery({
      q: "мриданга",
      sort: "price_asc",
      page: "3",
      utm_source: "telegram",
    });
    expect(query).toContain("q=");
    expect(query).toContain("sort=price_asc");
    expect(query).not.toContain("page");
    expect(query).not.toContain("utm_source");
  });

  // `?city=` в адресе означает «фильтр сброшен», а не «город — пустая строка».
  it("drops blank values", () => {
    expect(buildMarketQuery({ city: "", q: "   ", cursor: undefined })).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(buildMarketQuery({ city: "  Москва  " })).toBe(
      `?city=${encodeURIComponent("Москва")}`,
    );
  });

  // Next отдаёт массив при повторяющемся параметре; множественного выбора
  // в фильтрах Рынка нет, поэтому берём первое значение.
  it("collapses a repeated parameter to its first value", () => {
    expect(buildMarketQuery({ kind: ["service", "product"] })).toBe(
      "?kind=service",
    );
  });

  it("percent-encodes cyrillic values", () => {
    const query = buildMarketQuery({ q: "мриданга" });
    expect(query).toBe(`?q=${encodeURIComponent("мриданга")}`);
    expect(query).not.toContain("мриданга");
  });

  it("lets overrides add, replace and remove keys", () => {
    expect(buildMarketQuery({ sort: "new" }, { sort: "popular" })).toBe(
      "?sort=popular",
    );
    expect(buildMarketQuery({}, { priceMin: 100 })).toBe("?priceMin=100");
    expect(buildMarketQuery({ cursor: "abc" }, { cursor: undefined })).toBe("");
  });

  it("stringifies non-string override values", () => {
    expect(buildMarketQuery({}, { available: true })).toBe("?available=true");
    expect(buildMarketQuery({}, { priceMax: 1299.5 })).toBe("?priceMax=1299.5");
  });
});

describe("withFilter", () => {
  it("keeps the untouched filters", () => {
    const query = withFilter({ q: "мриданга", sort: "new" }, { kind: "product" });
    expect(query).toContain("q=");
    expect(query).toContain("sort=new");
    expect(query).toContain("kind=product");
  });

  // Курсор посчитан для прежней выдачи: оставить его — значит открыть вторую
  // страницу нового фильтра и потерять первую.
  it("always drops the cursor", () => {
    expect(withFilter({ cursor: "abc", sort: "new" }, { sort: "popular" })).toBe(
      "?sort=popular",
    );
  });

  it("removes a filter when the patch value is undefined", () => {
    expect(withFilter({ kind: "product", sort: "new" }, { kind: undefined })).toBe(
      "?sort=new",
    );
  });
});
