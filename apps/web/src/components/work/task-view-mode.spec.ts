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

  it("сохранённый «По правке» читается как «none» — кнопки больше нет (VED-525)", () => {
    window.localStorage.setItem("vedamatch:work-view:b1", "edited");
    expect(readWorkGroupMode("b1")).toBe("none");
  });

  it("испорченное значение в хранилище читается как «none»", () => {
    window.localStorage.setItem("vedamatch:work-view:b1", "1");
    expect(readWorkGroupMode("b1")).toBe("none");
  });
});

describe("миграция старого ключа vedamatch:work-grouped: (VED-51 → VED-160)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("старое «1» читается как priority и переносится в новый ключ", () => {
    window.localStorage.setItem("vedamatch:work-grouped:b1", "1");

    expect(readWorkGroupMode("b1")).toBe("priority");
    // Перенесено: новый ключ теперь хранит значение сам, старый убран.
    expect(window.localStorage.getItem("vedamatch:work-view:b1")).toBe(
      "priority",
    );
    expect(
      window.localStorage.getItem("vedamatch:work-grouped:b1"),
    ).toBeNull();

    // Повторное чтение не зависит от старого ключа — он уже удалён.
    expect(readWorkGroupMode("b1")).toBe("priority");
  });

  it("новый ключ перекрывает старый, если оба почему-то есть", () => {
    window.localStorage.setItem("vedamatch:work-grouped:b1", "1");
    window.localStorage.setItem("vedamatch:work-view:b1", "date");

    expect(readWorkGroupMode("b1")).toBe("date");
  });

  it("битое значение старого ключа не мигрирует и не роняет чтение", () => {
    window.localStorage.setItem("vedamatch:work-grouped:b1", "true");

    expect(readWorkGroupMode("b1")).toBe("none");
    expect(window.localStorage.getItem("vedamatch:work-view:b1")).toBeNull();
  });

  it("старый ключ чужой доски не переносится под текущую", () => {
    window.localStorage.setItem("vedamatch:work-grouped:b2", "1");

    expect(readWorkGroupMode("b1")).toBe("none");
  });
});
