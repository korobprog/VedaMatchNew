import { describe, expect, it } from "vitest";
import { resumeNeighbour, resumeQueue } from "./music-resume-queue";

describe("resumeQueue", () => {
  it("восстанавливает очередь целиком и встаёт на текущую запись", () => {
    // VED-70: иначе «предыдущая» и «следующая» на главной были мертвы.
    expect(resumeQueue("b", ["a", "b", "c"])).toEqual({
      queue: ["a", "b", "c"],
      index: 1,
    });
  });

  it("очередь без текущей записи — чужая: начинаем с одной записи", () => {
    expect(resumeQueue("x", ["a", "b"])).toEqual({ queue: ["x"], index: 0 });
  });

  it("пустая или отсутствующая очередь — одна запись", () => {
    expect(resumeQueue("a", [])).toEqual({ queue: ["a"], index: 0 });
    expect(resumeQueue("a", null)).toEqual({ queue: ["a"], index: 0 });
    expect(resumeQueue("a", undefined)).toEqual({ queue: ["a"], index: 0 });
  });

  it("мусор в очереди отбрасывается", () => {
    expect(resumeQueue("b", ["a", null, "", 7, "b"])).toEqual({
      queue: ["a", "b"],
      index: 1,
    });
  });
});

describe("resumeNeighbour", () => {
  // VED-88: кнопки на главной, пока плеер запись ещё не поднял.
  it("находит соседей текущей записи в сохранённой очереди", () => {
    expect(resumeNeighbour("b", ["a", "b", "c"], 1)).toBe("c");
    expect(resumeNeighbour("b", ["a", "b", "c"], -1)).toBe("a");
  });

  it("на краю очереди соседа нет", () => {
    expect(resumeNeighbour("a", ["a", "b"], -1)).toBeNull();
    expect(resumeNeighbour("b", ["a", "b"], 1)).toBeNull();
  });

  it("чужая или пустая очередь — соседей нет", () => {
    expect(resumeNeighbour("x", ["a", "b"], 1)).toBeNull();
    expect(resumeNeighbour("a", [], 1)).toBeNull();
  });
});
