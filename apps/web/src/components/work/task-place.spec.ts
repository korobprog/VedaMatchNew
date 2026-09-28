import { describe, expect, it, vi } from "vitest";
import type { WorkTaskDto } from "@vedamatch/shared";
import { draftFromTask } from "./task-edits";
import {
  createTaskPlacer,
  hasFormEdits,
  pendingFormEdits,
  pendingPlaceEdits,
  placeOf,
  withPlace,
} from "./task-place";

const task = {
  id: "t1",
  title: "Задача",
  description: "",
  columnId: "c1",
  sectionId: "c1",
  assignee: null,
  priority: "normal",
  dueAt: null,
} as unknown as WorkTaskDto;

const saved = draftFromTask(task);

describe("что считается правкой под «Сохранить» (VED-611)", () => {
  it("смена места — не правка", () => {
    expect(
      hasFormEdits(saved, { ...saved, columnId: "c2", sectionId: "c3" }),
    ).toBe(false);
  });

  it("правка поля — правка, и место её не прячет", () => {
    expect(hasFormEdits(saved, { ...saved, priority: "high" })).toBe(true);
    expect(
      hasFormEdits(saved, { ...saved, priority: "high", columnId: "c2" }),
    ).toBe(true);
  });

  it("«Сохранить» отправляет поля без места", () => {
    expect(
      pendingFormEdits(saved, {
        ...saved,
        assigneeId: "u2",
        columnId: "c2",
        sectionId: "c3",
      }),
    ).toEqual({ update: { assigneeId: "u2" }, columnId: null });
    expect(pendingFormEdits(saved, { ...saved, columnId: "c2" })).toBeNull();
  });
});

describe("что уходит сразу (VED-611)", () => {
  it("только место, даже если черновик несёт правки полей", () => {
    const draft = { ...saved, title: "Другое", columnId: "c2" };
    expect(pendingPlaceEdits(saved, placeOf(draft))).toEqual({
      update: null,
      columnId: "c2",
    });
  });

  it("раздел у задачи в статусе — правка поля, без переноса", () => {
    const inStatus = { ...saved, columnId: "c2" };
    expect(
      pendingPlaceEdits(inStatus, { columnId: "c2", sectionId: "c3" }),
    ).toEqual({ update: { sectionColumnId: "c3" }, columnId: null });
  });

  it("то же место — отправлять нечего", () => {
    expect(pendingPlaceEdits(saved, placeOf(saved))).toBeNull();
  });

  it("withPlace меняет только место", () => {
    expect(withPlace(saved, { columnId: "c9", sectionId: null })).toEqual({
      ...saved,
      columnId: "c9",
      sectionId: null,
    });
  });
});

describe("очередь места вне окна (VED-611)", () => {
  function deps() {
    return {
      update: vi.fn((_id: string, body: { sectionColumnId?: string | null }) =>
        Promise.resolve({
          ...task,
          sectionId: body.sectionColumnId ?? task.sectionId,
        } as WorkTaskDto),
      ),
      move: vi.fn((_id: string, body: { columnId: string }) =>
        Promise.resolve({ ...task, columnId: body.columnId } as WorkTaskDto),
      ),
    };
  }

  it("отправляет перенос и отдаёт карточку сервера", async () => {
    const d = deps();
    const placer = createTaskPlacer(d);
    const pending = placer.place(task, { columnId: "c2", sectionId: "c1" });
    expect(placer.pendingPlace("t1")).toEqual({
      columnId: "c2",
      sectionId: "c1",
    });

    const outcome = await pending;

    expect(d.move).toHaveBeenCalledWith("t1", { columnId: "c2" });
    expect(outcome).toMatchObject({ problem: null, last: true });
    expect(outcome.task.columnId).toBe("c2");
    expect(placer.pendingPlace("t1")).toBeUndefined();
  });

  it("два выбора подряд — по очереди, второй от итога первого", async () => {
    const d = deps();
    const placer = createTaskPlacer(d);
    const first = placer.place(task, { columnId: "c2", sectionId: "c1" });
    // Окно передаёт ту же карточку: итога первого оно ещё не видело.
    const second = placer.place(task, { columnId: "c1", sectionId: "c1" });

    expect(await first).toMatchObject({ last: false });
    expect(await second).toMatchObject({ last: true, problem: null });
    expect(d.move.mock.calls).toEqual([
      ["t1", { columnId: "c2" }],
      ["t1", { columnId: "c1" }],
    ]);
  });

  it("отказ сервера — итог с причиной и карточкой, как она на сервере", async () => {
    const d = deps();
    d.move.mockRejectedValueOnce(new Error("Нет прав"));
    const placer = createTaskPlacer(d);

    const outcome = await placer.place(task, {
      columnId: "c2",
      sectionId: "c1",
    });

    expect(outcome).toEqual({ task, problem: "Нет прав", last: true });
    expect(placer.pendingPlace("t1")).toBeUndefined();
  });

  it("то же место — без запроса", async () => {
    const d = deps();
    const placer = createTaskPlacer(d);
    const outcome = await placer.place(task, placeOf(task));
    expect(d.move).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(outcome).toEqual({ task, problem: null, last: true });
  });
});
