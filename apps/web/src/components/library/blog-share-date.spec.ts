import { describe, expect, it } from "vitest";
import { blogShareDate } from "./entry-share-actions";

describe("blogShareDate (VED-570)", () => {
  it("по-русски — число, месяц и год без хвоста «г.»", () => {
    expect(blogShareDate("2026-09-26T10:00:00.000Z", "ru")).toBe(
      "26 сент. 2026",
    );
  });

  it("по-английски — тоже с годом", () => {
    expect(blogShareDate("2026-09-26T10:00:00.000Z", "en")).toBe(
      "26 Sept 2026",
    );
  });

  it("год показывается и для текущего года, и для прошлого", () => {
    expect(blogShareDate("2025-01-05T10:00:00.000Z", "ru")).toBe("5 янв. 2025");
  });
});
