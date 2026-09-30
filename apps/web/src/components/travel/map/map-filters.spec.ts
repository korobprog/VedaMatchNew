import { describe, expect, it } from "vitest";
import {
  buildFilterParams,
  inBounds,
  isGroupSelected,
  kindsOfGroup,
  parseFilters,
  parseKinds,
  toggleGroup,
} from "./map-filters";

const params = (query: string) => new URLSearchParams(query);

describe("map-filters", () => {
  it("парсит виды и отбрасывает неизвестные", () => {
    expect(parseKinds("cafe,zzz,temple")).toEqual(["temple", "cafe"]);
    expect(parseKinds(null)).toEqual([]);
  });

  it("группа включает и выключает все свои виды", () => {
    const on = toggleGroup([], "food");
    expect(on).toEqual(kindsOfGroup("food"));
    expect(isGroupSelected(on, "food")).toBe(true);
    expect(toggleGroup(on, "food")).toEqual([]);
  });

  it("не трогает виды другой группы", () => {
    const next = toggleGroup(["temple"], "food");
    expect(next).toContain("temple");
    expect(toggleGroup(next, "food")).toEqual(["temple"]);
  });

  it("разбирает group и communities из URL", () => {
    const filters = parseFilters(params("group=holy&communities=0&q=abc"));
    expect(filters.kinds).toEqual(kindsOfGroup("holy"));
    expect(filters.communities).toBe(false);
    expect(filters.q).toBe("abc");
  });

  it("собирает параметры без пустых значений", () => {
    const filters = parseFilters(params(""));
    expect(filters.communities).toBe(true);
    expect(buildFilterParams(filters)).toBe("");
    expect(
      buildFilterParams(
        { kinds: ["cafe"], q: " чай ", lineage: "iskcon", communities: false, stays: false },
        { focus: "p1" },
      ),
    ).toBe("kinds=cafe&q=%D1%87%D0%B0%D0%B9&lineage=iskcon&communities=0&stays=0&focus=p1");
  });

  it("stays включён по умолчанию, stays=0 выключает и возвращается в URL", () => {
    expect(parseFilters(params("")).stays).toBe(true);
    const off = parseFilters(params("stays=0"));
    expect(off.stays).toBe(false);
    expect(buildFilterParams(off)).toBe("stays=0");
    expect(parseFilters(params("stays=1")).stays).toBe(true);
    expect(buildFilterParams(parseFilters(params("stays=1")))).toBe("");
  });

  it("inBounds учитывает антимеридиан", () => {
    const b = { north: 10, south: 0, east: 20, west: 10 };
    expect(inBounds({ lat: 5, lng: 15 }, b)).toBe(true);
    expect(inBounds({ lat: 11, lng: 15 }, b)).toBe(false);
    expect(inBounds({ lat: 5, lng: 25 }, b)).toBe(false);
    const wrap = { north: 10, south: 0, east: -170, west: 170 };
    expect(inBounds({ lat: 5, lng: 175 }, wrap)).toBe(true);
    expect(inBounds({ lat: 5, lng: 0 }, wrap)).toBe(false);
  });
});
