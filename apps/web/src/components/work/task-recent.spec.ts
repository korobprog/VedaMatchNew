import { describe, expect, it } from "vitest";
import { recentTasks } from "./task-recent";

const task = (id: string, touchedAt: string | null, foreign = false) => ({
  id,
  touchedAt,
  foreign,
});

describe("recentTasks (VED-485)", () => {
  it("свежие сверху, по всей доске", () => {
    const list = recentTasks([
      { tasks: [task("a", "2026-09-24T10:00:00Z"), task("b", null)] },
      { tasks: [task("c", "2026-09-24T12:00:00Z")] },
    ]);
    expect(list.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("чужие и нетронутые не входят", () => {
    const list = recentTasks([
      {
        tasks: [
          task("mine", "2026-09-24T10:00:00Z"),
          task("theirs", "2026-09-24T11:00:00Z", true),
          task("never", null),
        ],
      },
    ]);
    expect(list.map((item) => item.id)).toEqual(["mine"]);
  });

  it("не больше лимита", () => {
    const tasks = Array.from({ length: 5 }, (_, at) =>
      task(`t${at}`, `2026-09-2${at}T10:00:00Z`),
    );
    expect(recentTasks([{ tasks }], 2).map((item) => item.id)).toEqual([
      "t4",
      "t3",
    ]);
  });
});
