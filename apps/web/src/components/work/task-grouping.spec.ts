import { beforeEach, describe, expect, it } from "vitest";
import type { WorkTaskPriority } from "@vedamatch/shared";
import {
  groupTasksByPriority,
  priorityGroupingKey,
  readPriorityGrouping,
  writePriorityGrouping,
} from "./task-grouping";

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

describe("настройка вида на устройстве", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("запоминается по доске и снимается начисто", () => {
    writePriorityGrouping("b1", true);

    expect(readPriorityGrouping("b1")).toBe(true);
    // Соседняя доска о чужом виде не знает.
    expect(readPriorityGrouping("b2")).toBe(false);

    writePriorityGrouping("b1", false);

    expect(readPriorityGrouping("b1")).toBe(false);
    expect(window.localStorage.getItem(priorityGroupingKey("b1"))).toBeNull();
  });
});
