import { describe, expect, it } from "vitest";
import type { WorkBoardDto, WorkTaskCardDto } from "@vedamatch/shared";
import {
  columnBeside,
  columnNeighbours,
  isOverWip,
  looksDone,
  moveTaskLocally,
  neighboursOf,
} from "./board-state";

function card(id: string): WorkTaskCardDto {
  return {
    id,
    key: `VM-${id}`,
    number: Number(id.replace(/\D/g, "")) || 1,
    columnId: "",
    title: id,
    position: 0,
    priority: "normal",
    dueAt: null,
    completedAt: null,
    assignee: null,
    labels: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    attachmentCount: 0,
    hasDescription: false,
  };
}

function board(): WorkBoardDto {
  return {
    id: "b1",
    spaceId: "s1",
    name: "Доска",
    role: "member",
    viewerId: "u1",
    labels: [],
    members: [],
    columns: [
      {
        id: "todo",
        name: "Надо",
        position: 0,
        wipLimit: 0,
        isDone: false,
        tasks: [
          { ...card("t1"), columnId: "todo" },
          { ...card("t2"), columnId: "todo" },
        ],
      },
      {
        id: "doing",
        name: "В работе",
        position: 1,
        wipLimit: 2,
        isDone: false,
        tasks: [{ ...card("t3"), columnId: "doing" }],
      },
      {
        id: "done",
        name: "Готово",
        position: 2,
        wipLimit: 0,
        isDone: true,
        tasks: [],
      },
    ],
  };
}

describe("moveTaskLocally", () => {
  it("переносит карточку в другую колонку на нужное место", () => {
    const next = moveTaskLocally(board(), "t1", "doing", 0);
    expect(next.columns[0].tasks.map((t) => t.id)).toEqual(["t2"]);
    expect(next.columns[1].tasks.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(next.columns[1].tasks[0].columnId).toBe("doing");
  });

  it("переставляет внутри своей колонки", () => {
    const next = moveTaskLocally(board(), "t2", "todo", 0);
    expect(next.columns[0].tasks.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("колонка «готово» закрывает задачу", () => {
    const next = moveTaskLocally(board(), "t1", "done", 0);
    expect(next.columns[2].tasks[0].completedAt).not.toBeNull();
  });

  it("выезд из «готово» открывает задачу обратно", () => {
    const closed = moveTaskLocally(board(), "t1", "done", 0);
    const reopened = moveTaskLocally(closed, "t1", "todo", 0);
    expect(
      reopened.columns[0].tasks.find((t) => t.id === "t1")?.completedAt,
    ).toBeNull();
  });

  it("индекс за пределами колонки прижимается к её краю", () => {
    const next = moveTaskLocally(board(), "t1", "doing", 99);
    expect(next.columns[1].tasks.map((t) => t.id)).toEqual(["t3", "t1"]);
  });

  it("исходную доску не трогает: откат при ошибке возможен", () => {
    const original = board();
    moveTaskLocally(original, "t1", "doing", 0);
    expect(original.columns[0].tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("несуществующая карточка или колонка ничего не меняет", () => {
    const original = board();
    expect(moveTaskLocally(original, "ghost", "doing", 0)).toBe(original);
    expect(moveTaskLocally(original, "t1", "ghost", 0)).toBe(original);
  });
});

describe("neighboursOf", () => {
  it("называет обоих соседей", () => {
    const next = moveTaskLocally(board(), "t1", "doing", 1);
    expect(neighboursOf(next, "t1")).toEqual({
      afterTaskId: "t3",
      beforeTaskId: null,
    });
  });

  it("первая в колонке — верхнего соседа нет", () => {
    expect(neighboursOf(board(), "t1")).toEqual({
      afterTaskId: null,
      beforeTaskId: "t2",
    });
  });
});

describe("columnBeside", () => {
  it("соседняя колонка справа и слева", () => {
    expect(columnBeside(board(), "todo", 1)).toBe("doing");
    expect(columnBeside(board(), "doing", -1)).toBe("todo");
  });

  it("за краем доски соседа нет", () => {
    expect(columnBeside(board(), "todo", -1)).toBeNull();
    expect(columnBeside(board(), "done", 1)).toBeNull();
  });
});

describe("isOverWip", () => {
  it("без лимита не переполняется никогда", () => {
    expect(isOverWip({ wipLimit: 0, tasks: [1, 2, 3, 4] })).toBe(false);
  });

  it("ровно по лимиту — ещё не перебор", () => {
    expect(isOverWip({ wipLimit: 2, tasks: [1, 2] })).toBe(false);
    expect(isOverWip({ wipLimit: 2, tasks: [1, 2, 3] })).toBe(true);
  });
});

describe("columnNeighbours", () => {
  const columns = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("шаг раньше ставит колонку между её соседями слева", () => {
    expect(columnNeighbours(columns, "c", -1)).toEqual({
      afterColumnId: "a",
      beforeColumnId: "b",
    });
  });

  it("шаг позже ставит колонку за следующую", () => {
    expect(columnNeighbours(columns, "b", 1)).toEqual({
      afterColumnId: "c",
      beforeColumnId: "d",
    });
  });

  it("первая колонка становится второй, а не остаётся на месте", () => {
    expect(columnNeighbours(columns, "a", 1)).toEqual({
      afterColumnId: "b",
      beforeColumnId: "c",
    });
  });

  it("последняя колонка встаёт предпоследней", () => {
    expect(columnNeighbours(columns, "d", -1)).toEqual({
      afterColumnId: "b",
      beforeColumnId: "c",
    });
  });

  it("с краю двигать некуда", () => {
    expect(columnNeighbours(columns, "a", -1)).toBeNull();
    expect(columnNeighbours(columns, "d", 1)).toBeNull();
  });

  it("чужая колонка — не повод гадать", () => {
    expect(columnNeighbours(columns, "z", -1)).toBeNull();
  });
});

describe("looksDone", () => {
  it("узнаёт колонку конца работы в разных написаниях", () => {
    for (const name of [
      "Готово",
      "готово",
      "Выполнено ✅",
      "ВЫПОЛНЕНО",
      "Завершённые",
      "Сделано",
      "Закрыто",
      "Done",
      "Completed",
    ]) {
      expect(looksDone(name)).toBe(true);
    }
  });

  it("рабочие колонки не трогает", () => {
    for (const name of [
      "Надо",
      "В работе",
      "Тестерование",
      "На доработку",
      "РАЗНОЕ.",
      "Идеи",
    ]) {
      expect(looksDone(name)).toBe(false);
    }
  });

  it("«не готово» — тоже про готовность: спросить дешевле, чем промолчать", () => {
    // Подсказка не принимает решение за человека, поэтому лишний вопрос
    // здесь безопаснее пропущенного.
    expect(looksDone("Не готово")).toBe(true);
  });
});
