import { describe, expect, it } from "vitest";
import type { WorkBoardDto, WorkTaskCardDto } from "@vedamatch/shared";
import { moveTaskLocally } from "./board-state";
import {
  boardDropIndex,
  countForeign,
  folderColumns,
  foreignFolderHint,
  setTaskViewedLocally,
  taskMark,
} from "./foreign-tasks";

function card(
  id: string,
  over: Partial<WorkTaskCardDto> = {},
): WorkTaskCardDto {
  return {
    id,
    key: `VED-${id}`,
    number: 1,
    columnId: "c1",
    statusMark: "testing",
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
    createdAt: "2026-09-01T00:00:00.000Z",
    foreign: false,
    viewed: false,
    sectionId: null,
    editedAt: "2026-09-01T00:00:00.000Z",
    touchedAt: null,
    ...over,
  };
}

function board(columns: Array<{ id: string; tasks: WorkTaskCardDto[] }>) {
  return {
    id: "b1",
    spaceId: "s1",
    name: "Доска",
    labels: [],
    members: [],
    role: "admin",
    viewerId: "stas",
    kind: "regular",
    commercial: null,
    canSeeFinance: false,
    columns: columns.map((column, index) => ({
      id: column.id,
      name: column.id,
      position: index,
      wipLimit: 0,
      isDone: false,
      statusMark: "testing" as const,
      tasks: column.tasks.map((task) => ({ ...task, columnId: column.id })),
    })),
  } satisfies WorkBoardDto;
}

describe("taskMark (VED-320)", () => {
  it("у чужой задачи — «Чужое» вместо состояния", () => {
    expect(taskMark(card("a", { foreign: true }))).toBe("foreign");
  });

  it("у своей — настоящее состояние", () => {
    expect(taskMark(card("a", { statusMark: "rework" }))).toBe("rework");
    expect(taskMark(card("a", { statusMark: null }))).toBe(null);
  });
});

describe("папка «Чужие»", () => {
  const columns = board([
    {
      id: "test",
      tasks: [card("mine"), card("theirs", { foreign: true })],
    },
    { id: "done", tasks: [card("closed")] },
    { id: "empty", tasks: [] },
  ]).columns;

  it("по умолчанию чужих не видно, а колонки остаются все", () => {
    const shown = folderColumns(columns, "mine");
    expect(shown.map((column) => column.id)).toEqual(["test", "done", "empty"]);
    expect(shown[0]?.tasks.map((task) => task.id)).toEqual(["mine"]);
  });

  it("в папке — только чужие и только колонки, где они есть", () => {
    const shown = folderColumns(columns, "foreign");
    expect(shown.map((column) => column.id)).toEqual(["test"]);
    expect(shown[0]?.tasks.map((task) => task.id)).toEqual(["theirs"]);
  });

  it("считает чужие по всей доске", () => {
    expect(countForeign(columns)).toBe(1);
    expect(countForeign([])).toBe(0);
  });

  it("подпись согласует число и слова", () => {
    expect(foreignFolderHint(1, "mine")).toBe(
      "1 задача скрыта: их составил и ведёт другой участник",
    );
    expect(foreignFolderHint(3, "mine")).toBe(
      "3 задачи скрыты: их составил и ведёт другой участник",
    );
    expect(foreignFolderHint(5, "foreign")).toBe(
      "Показаны только чужие: 5 задач. Их составил и ведёт другой участник",
    );
  });
});

describe("boardDropIndex: перенос мимо спрятанных чужих", () => {
  // Колонка: A, [x чужая], B, [y чужая], C. Видно A, B, C.
  const tasks = [
    card("A"),
    card("x", { foreign: true }),
    card("B"),
    card("y", { foreign: true }),
    card("C"),
  ];
  const shown = (task: WorkTaskCardDto) => !task.foreign;

  it("щель перед видимой карточкой — перед ней и во всей колонке", () => {
    expect(boardDropIndex(tasks, shown, "drag", 0)).toBe(0);
    expect(boardDropIndex(tasks, shown, "drag", 1)).toBe(2);
    expect(boardDropIndex(tasks, shown, "drag", 2)).toBe(4);
  });

  it("ниже последней видимой — сразу за ней", () => {
    expect(boardDropIndex(tasks, shown, "drag", 3)).toBe(5);
  });

  it("переносимую карточку не считает: индекс — как у moveTaskLocally", () => {
    // Тянем A вниз и опускаем между B и C: среди видимых без A это место 1.
    const index = boardDropIndex(tasks, shown, "A", 1);
    const moved = moveTaskLocally(
      board([{ id: "c1", tasks }]),
      "A",
      "c1",
      index,
    );
    expect(moved.columns[0]?.tasks.map((task) => task.id)).toEqual([
      "x",
      "B",
      "y",
      "A",
      "C",
    ]);
  });

  it("в колонке одни чужие — наверх", () => {
    expect(
      boardDropIndex([card("x", { foreign: true })], shown, "drag", 0),
    ).toBe(0);
  });
});

describe("setTaskViewedLocally (VED-365)", () => {
  it("меняет отметку у одной карточки и не трогает остальные", () => {
    const before = board([
      { id: "c1", tasks: [card("a"), card("b")] },
      { id: "c2", tasks: [card("c")] },
    ]);
    const after = setTaskViewedLocally(before, "b", true);
    expect(
      after.columns.flatMap((column) =>
        column.tasks.map((task) => [task.id, task.viewed]),
      ),
    ).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
    // Колонку без карточки не пересобирает.
    expect(after.columns[1]).toBe(before.columns[1]);
  });
});
