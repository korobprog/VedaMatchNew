import { describe, expect, it } from "vitest";
import {
  buildRouteFilterParams,
  parseRouteFilters,
  toggleRouteKind,
} from "./route-filters";

const params = (s: string) => new URLSearchParams(s);

describe("route filters", () => {
  it("разбирает виды, отбрасывая чужие", () => {
    expect(parseRouteFilters(params("kinds=trail,bogus,parikrama&q=Вр")).kinds).toEqual([
      "parikrama",
      "trail",
    ]);
  });
  it("собирает строку без пустых значений", () => {
    expect(buildRouteFilterParams({ kinds: [], q: " " })).toBe("");
    expect(buildRouteFilterParams({ kinds: ["trail"], q: "а" })).toBe(
      "kinds=trail&q=%D0%B0",
    );
  });
  it("переключает вид", () => {
    expect(toggleRouteKind([], "trail")).toEqual(["trail"]);
    expect(toggleRouteKind(["trail"], "trail")).toEqual([]);
  });
});
