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

  it("повторяющийся параметр берёт первым: ?pageSize=24&pageSize=48", () => {
    expect(resolveUnionPageSize(["24", "48"])).toBe(24);
  });

  it("не просит больше, чем принимает API", () => {
    // MAX_PAGE_SIZE в union-profile.service.ts — 50; выше него ответ молча
    // обрезался бы, и подпись «показывать по 100» врала бы.
    expect(Math.max(...UNION_PAGE_SIZES)).toBeLessThanOrEqual(50);
  });
});
