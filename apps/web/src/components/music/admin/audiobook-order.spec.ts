import { describe, expect, it } from "vitest";
import { moveChapter } from "./audiobook-order";

describe("moveChapter", () => {
  it("поднимает и опускает на одно место", () => {
    expect(moveChapter(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveChapter(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("у края ничего не меняет и не теряет главу", () => {
    expect(moveChapter(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveChapter(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("не трогает исходный массив", () => {
    const items = ["a", "b"];
    moveChapter(items, 0, 1);
    expect(items).toEqual(["a", "b"]);
  });
});
