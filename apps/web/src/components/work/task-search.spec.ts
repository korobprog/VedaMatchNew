import { describe, expect, it } from "vitest";
import {
  countMatches,
  countTasks,
  isColumnFolded,
  isTaskQuery,
  searchBoardColumns,
  searchColumns,
  searchSummary,
  searchToggleLabel,
} from "./task-search";

const columns = [
  { id: "todo", name: "Сделать", tasks: [{ id: "a" }, { id: "b" }] },
  { id: "doing", name: "В работе", tasks: [{ id: "c" }] },
  { id: "done", name: "Готово", tasks: [{ id: "d" }, { id: "e" }] },
];

describe("isTaskQuery", () => {
  it("waits for at least two letters", () => {
    expect(isTaskQuery("")).toBe(false);
    expect(isTaskQuery(" о ")).toBe(false);
    expect(isTaskQuery("от")).toBe(true);
  });

  // «7» — это номер задачи, его и ищут.
  it("takes a lone number right away", () => {
    expect(isTaskQuery("7")).toBe(true);
  });
});

describe("searchColumns", () => {
  it("keeps only the matched cards and drops columns left empty", () => {
    const shown = searchColumns(columns, new Set(["b", "e"]));
    expect(shown.map((column) => [column.id, column.tasks.map((t) => t.id)])).toEqual([
      ["todo", ["b"]],
      ["done", ["e"]],
    ]);
  });

  it("does not touch the board it filters", () => {
    searchColumns(columns, new Set(["a"]));
    expect(columns[0].tasks).toHaveLength(2);
  });

  it("returns nothing when nothing matched", () => {
    expect(searchColumns(columns, new Set())).toEqual([]);
  });
});

describe("searchSummary", () => {
  it("says how much of the board is shown", () => {
    expect(searchSummary(1, 42)).toBe("Нашлась 1 задача из 42");
    expect(searchSummary(3, 42)).toBe("Нашлось 3 задачи из 42");
    expect(searchSummary(11, 42)).toBe("Нашлось 11 задач из 42");
  });

  it("says plainly when nothing was found", () => {
    expect(searchSummary(0, 42)).toBe("Ничего не нашлось");
  });
});

describe("countTasks", () => {
  it("counts cards across the columns", () => {
    expect(countTasks({ columns } as never)).toBe(5);
  });
});

/**
 * VED-131, третий круг: «нажимаешь на неё и не отображается запрос». Кнопка
 * сбрасывала поиск — поле пустело, находки терялись среди всей доски.
 */
describe("«Показать все» — вся доска без потери поиска", () => {
  const matches = new Set(["b", "e"]);

  it("без переключателя — одни находки", () => {
    expect(
      searchBoardColumns(columns, matches, false).map((column) => column.id),
    ).toEqual(["todo", "done"]);
  });

  it("с переключателем — все колонки и все карточки, как без поиска", () => {
    const shown = searchBoardColumns(columns, matches, true);
    expect(shown.map((column) => column.tasks.map((t) => t.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d", "e"],
    ]);
  });

  it("считает находки в колонке для счётчика «1 из 2»", () => {
    expect(countMatches(columns[0].tasks, matches)).toBe(1);
    expect(countMatches(columns[1].tasks, matches)).toBe(0);
  });

  it("подпись кнопки говорит, что будет по нажатию", () => {
    expect(searchToggleLabel(false)).toBe("Показать все");
    expect(searchToggleLabel(true)).toBe("Только найденные");
  });
});

describe("isColumnFolded", () => {
  const collapsed = ["todo", "doing"];

  it("без поиска — как оставил человек", () => {
    expect(
      isColumnFolded({ collapsed, columnId: "todo", searchActive: false, hasMatches: true }),
    ).toBe(true);
    expect(
      isColumnFolded({ collapsed, columnId: "done", searchActive: false, hasMatches: false }),
    ).toBe(false);
  });

  it("в поиске колонка с находками раскрыта, пустая — как была", () => {
    expect(
      isColumnFolded({ collapsed, columnId: "todo", searchActive: true, hasMatches: true }),
    ).toBe(false);
    expect(
      isColumnFolded({ collapsed, columnId: "doing", searchActive: true, hasMatches: false }),
    ).toBe(true);
  });
});
