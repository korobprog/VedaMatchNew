import { describe, expect, it } from "vitest";
import { resumeQueue } from "./music-resume-queue";

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
