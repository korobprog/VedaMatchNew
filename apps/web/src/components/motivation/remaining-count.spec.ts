import { describe, expect, it } from "vitest";
import { remainingAfter } from "./remaining-count";

describe("remainingAfter", () => {
  it("считает, сколько осталось после поста на экране", () => {
    expect(remainingAfter(10, 0)).toBe(9);
    expect(remainingAfter(10, 8)).toBe(1);
    expect(remainingAfter(10, 9)).toBe(0);
  });

  it("не уходит в минус, если лента длиннее обещанного", () => {
    expect(remainingAfter(3, 7)).toBe(0);
  });

  it("без числа от сервера счётчика нет", () => {
    expect(remainingAfter(undefined, 0)).toBeNull();
    expect(remainingAfter(5, -1)).toBeNull();
  });
});
