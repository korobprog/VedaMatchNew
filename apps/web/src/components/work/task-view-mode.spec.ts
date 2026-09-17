import { beforeEach, describe, expect, it } from "vitest";
import { readWorkGroupMode, writeWorkGroupMode } from "./task-view-mode";

describe("вид доски на устройстве", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("без записи — режим «none»", () => {
    expect(readWorkGroupMode("b1")).toBe("none");
  });

  it("запоминается по доске и снимается начисто", () => {
    writeWorkGroupMode("b1", "priority");

    expect(readWorkGroupMode("b1")).toBe("priority");
    // Соседняя доска о чужом виде не знает.
    expect(readWorkGroupMode("b2")).toBe("none");

    writeWorkGroupMode("b1", "none");

    expect(readWorkGroupMode("b1")).toBe("none");
  });

  it("переключение режима заменяет прежний, а не складывает оба", () => {
    writeWorkGroupMode("b1", "priority");
    writeWorkGroupMode("b1", "date");

    expect(readWorkGroupMode("b1")).toBe("date");
  });

  it("испорченное значение в хранилище читается как «none»", () => {
    window.localStorage.setItem("vedamatch:work-view:b1", "1");
    expect(readWorkGroupMode("b1")).toBe("none");
  });
});
