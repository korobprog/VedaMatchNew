import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNION_PAGE_SIZE,
  UNION_PAGE_SIZES,
  resolveUnionPageSize,
} from "./page-size";

describe("resolveUnionPageSize", () => {
  it("узнаёт свои значения", () => {
    for (const size of UNION_PAGE_SIZES)
      expect(resolveUnionPageSize(String(size))).toBe(size);
  });

  it("без выбора отдаёт значение по умолчанию", () => {
    expect(resolveUnionPageSize(undefined)).toBe(DEFAULT_UNION_PAGE_SIZE);
    expect(resolveUnionPageSize("")).toBe(DEFAULT_UNION_PAGE_SIZE);
  });

  it("не исполняет «покажи пять тысяч» из адреса", () => {
    expect(resolveUnionPageSize("5000")).toBe(DEFAULT_UNION_PAGE_SIZE);
    expect(resolveUnionPageSize("0")).toBe(DEFAULT_UNION_PAGE_SIZE);
    expect(resolveUnionPageSize("-12")).toBe(DEFAULT_UNION_PAGE_SIZE);
    expect(resolveUnionPageSize("двенадцать")).toBe(DEFAULT_UNION_PAGE_SIZE);
  });

  it("повторяющийся параметр берёт первым: ?pageSize=25&pageSize=50", () => {
    expect(resolveUnionPageSize(["25", "50"])).toBe(25);
  });

  it("25, 50, 100 и 12 для телефона; по умолчанию — 100 (VED-654)", () => {
    expect(UNION_PAGE_SIZES).toEqual([12, 25, 50, 100]);
    expect(DEFAULT_UNION_PAGE_SIZE).toBe(100);
  });

  it("не просит больше, чем принимает API", () => {
    // MAX_PAGE_SIZE в union-profile.service.ts — 100 (VED-654); выше него
    // ответ молча обрезался бы, и подпись «показывать по …» врала бы.
    expect(Math.max(...UNION_PAGE_SIZES)).toBeLessThanOrEqual(100);
  });
});
