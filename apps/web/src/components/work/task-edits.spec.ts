import { describe, expect, it } from "vitest";
import {
  draftFromTask,
  hasTaskEdits,
  pendingTaskEdits,
  taskEditsProblem,
  type TaskDraft,
} from "./task-edits";

const saved: TaskDraft = {
  title: "Кнопка",
  description: "Текст",
  columnId: "c1",
  assigneeId: null,
  priority: "normal",
  due: "",
};

describe("draftFromTask", () => {
  it("собирает черновик из карточки, срок — в виде поля ввода", () => {
    const draft = draftFromTask({
      title: "Кнопка",
      description: "Текст",
      columnId: "c1",
      assignee: { userId: "u2", name: "Радха" } as never,
      priority: "high",
      dueAt: null,
    });
    expect(draft).toEqual({
      title: "Кнопка",
      description: "Текст",
      columnId: "c1",
      assigneeId: "u2",
      priority: "high",
      due: "",
    });
  });
});

describe("hasTaskEdits", () => {
  it("пробелы вокруг названия правкой не считаются", () => {
    expect(hasTaskEdits(saved, { ...saved, title: " Кнопка " })).toBe(false);
  });

  // VED-56: «кнопка сохранить появлялась после любой правки».
  it.each([
    ["описание", { description: "Текст." }],
    ["раздел", { columnId: "c2" }],
    ["исполнитель", { assigneeId: "u2" }],
    ["важность", { priority: "high" as const }],
    ["срок", { due: "2026-09-30T18:00" }],
    ["недописанный срок", { due: "не дата" }],
  ])("правка поля «%s» — это правка", (_name, change) => {
    expect(hasTaskEdits(saved, { ...saved, ...change })).toBe(true);
  });
});

describe("pendingTaskEdits", () => {
  it("отправляет только изменённое", () => {
    expect(
      pendingTaskEdits(saved, { ...saved, title: "Кнопка «Сохранить»" }),
    ).toEqual({ update: { title: "Кнопка «Сохранить»" }, columnId: null });
    expect(pendingTaskEdits(saved, saved)).toBeNull();
  });

  it("перенос — отдельно от полей карточки", () => {
    expect(pendingTaskEdits(saved, { ...saved, columnId: "c2" })).toEqual({
      update: null,
      columnId: "c2",
    });
  });

  it("исполнитель, важность и срок едут одним запросом", () => {
    expect(
      pendingTaskEdits(saved, {
        ...saved,
        assigneeId: "u2",
        priority: "urgent",
        due: "2026-09-30T18:00",
      }),
    ).toEqual({
      update: {
        assigneeId: "u2",
        priority: "urgent",
        dueAt: new Date("2026-09-30T18:00").toISOString(),
      },
      columnId: null,
    });
  });

  it("снять исполнителя и срок — тоже правка", () => {
    const full = { ...saved, assigneeId: "u2", due: "2026-09-30T18:00" };
    expect(
      pendingTaskEdits(full, { ...full, assigneeId: null, due: "" }),
    ).toEqual({ update: { assigneeId: null, dueAt: null }, columnId: null });
  });

  // Пустое название и недописанный срок не уходят, но и остальное из-за них
  // не теряется — закрытие окна сохраняет, что может.
  it("отбрасывает негодное, остальное сохраняет", () => {
    expect(
      pendingTaskEdits(saved, {
        ...saved,
        title: "",
        due: "не дата",
        description: "Новое",
      }),
    ).toEqual({ update: { description: "Новое" }, columnId: null });
  });
});

describe("taskEditsProblem", () => {
  it("пустое название", () => {
    expect(taskEditsProblem({ title: "  ", due: "" })).toBe(
      "Название не может быть пустым",
    );
  });

  it("недописанный срок", () => {
    expect(taskEditsProblem({ title: "Кнопка", due: "не дата" })).toBe(
      "Срок указан не полностью",
    );
  });

  it("всё в порядке", () => {
    expect(taskEditsProblem({ title: "Кнопка", due: "" })).toBeNull();
    expect(
      taskEditsProblem({ title: "Кнопка", due: "2026-09-30T18:00" }),
    ).toBeNull();
  });
});
