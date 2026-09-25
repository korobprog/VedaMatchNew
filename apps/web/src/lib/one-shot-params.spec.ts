import { describe, expect, it } from "vitest";
import { withoutOneShotParams } from "./one-shot-params";

describe("withoutOneShotParams (VED-500)", () => {
  it("убирает ключ задачи из адреса планировщика", () => {
    expect(withoutOneShotParams("/work/planner/s1?task=VED-515")).toBe(
      "/work/planner/s1",
    );
  });

  it("остальные параметры и якорь оставляет", () => {
    expect(
      withoutOneShotParams("/work/planner/s1?view=recent&task=VED-1#top"),
    ).toBe("/work/planner/s1?view=recent#top");
  });

  it("чужие адреса не трогает", () => {
    expect(withoutOneShotParams("/library?task=x")).toBe("/library?task=x");
    expect(withoutOneShotParams("/work/planner/s1")).toBe("/work/planner/s1");
    expect(withoutOneShotParams("/work/planner/s1?view=a")).toBe(
      "/work/planner/s1?view=a",
    );
  });
});
