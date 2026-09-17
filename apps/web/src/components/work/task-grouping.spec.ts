import { describe, expect, it } from "vitest";
import type { WorkTaskPriority } from "@vedamatch/shared";
import { groupTasksByPriority } from "./task-grouping";

const task = (id: string, priority: WorkTaskPriority) => ({ id, priority });

describe("groupTasksByPriority", () => {
  it("ставит горящее наверх и пустых групп не выдумывает", () => {
    const groups = groupTasksByPriority([
      task("a", "normal"),
      task("b", "urgent"),
      task("c", "low"),
      task("d", "urgent"),
    ]);

    expect(groups.map((group) => group.priority)).toEqual([
      "urgent",
      "normal",
      "low",
    ]);
    expect(groups[0].title).toBe("Срочно");
    expect(groups[0].tasks.map((item) => item.id)).toEqual(["b", "d"]);
  });

  // Внутри группы порядок задан руками на доске — группировка его не трогает.
  it("сохраняет порядок внутри группы", () => {
    const groups = groupTasksByPriority([
      task("первая", "high"),
      task("вторая", "high"),
      task("третья", "high"),
    ]);

    expect(groups[0].tasks.map((item) => item.id)).toEqual([
      "первая",
      "вторая",
      "третья",
    ]);
  });

  it("в пустом разделе групп нет", () => {
    expect(groupTasksByPriority([])).toEqual([]);
  });
});
