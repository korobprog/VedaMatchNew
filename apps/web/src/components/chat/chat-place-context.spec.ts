import { describe, expect, it } from "vitest";
import type { ChatTravelMapContext } from "@vedamatch/shared";
import { placeContextHref, placeContextLabel } from "./chat-place-context";

const context: ChatTravelMapContext = {
  service: "travel-map",
  id: "p 1",
  title: "Гоура",
  status: "active",
  meta: { kindLabel: "Вегетарианское кафе", city: "Маяпур" },
};

describe("placeContextLabel", () => {
  it("склеивает вид и город", () => {
    expect(placeContextLabel(context)).toBe("Вегетарианское кафе · Маяпур");
  });
  it("пропускает пустой город", () => {
    expect(
      placeContextLabel({ ...context, meta: { kindLabel: "Храм", city: null } }),
    ).toBe("Храм");
  });
  it("без меты пусто", () => {
    expect(placeContextLabel({ ...context, meta: null })).toBe("");
  });
  it("ссылка экранирует id", () => {
    expect(placeContextHref(context)).toBe("/travel/map/places/p%201");
  });
});
