import { describe, expect, it } from "vitest";
import { findTaskByKey, parseFocusKey } from "./task-focus";

const board = {
  columns: [
    { id: "c1", tasks: [{ id: "t1", key: "VED-1" }] },
    {
      id: "c2",
      tasks: [
        { id: "t2", key: "VED-42" },
        { id: "t3", key: "MD-7" },
      ],
    },
  ],
};

describe("parseFocusKey", () => {
  it("берёт ключ из адреса уведомления", () => {
    expect(parseFocusKey("?task=VED-42")).toBe("VED-42");
    expect(parseFocusKey("task=VED-42")).toBe("VED-42");
  });

  it("не придирается к регистру и пробелам", () => {
    expect(parseFocusKey("?task=ved-42")).toBe("VED-42");
    expect(parseFocusKey("?task=%20VED-42%20")).toBe("VED-42");
  });

  it("находит ключ среди прочих параметров", () => {
    expect(parseFocusKey("?from=push&task=VED-42&x=1")).toBe("VED-42");
  });

  it("без ключа — ничего не открываем", () => {
    expect(parseFocusKey("")).toBeNull();
    expect(parseFocusKey(null)).toBeNull();
    expect(parseFocusKey("?other=1")).toBeNull();
    expect(parseFocusKey("?task=")).toBeNull();
  });

  it("мусор отбрасывается молча: доска обязана открыться", () => {
    expect(parseFocusKey("?task=не-ключ")).toBeNull();
    expect(parseFocusKey("?task=VED42")).toBeNull();
    expect(parseFocusKey("?task=<script>")).toBeNull();
  });
});

describe("findTaskByKey", () => {
  it("находит задачу в любой колонке и говорит, в какой она", () => {
    expect(findTaskByKey(board, "VED-42")).toEqual({
      taskId: "t2",
      columnId: "c2",
    });
    expect(findTaskByKey(board, "VED-1")).toEqual({
      taskId: "t1",
      columnId: "c1",
    });
  });

  it("регистр в ссылке не мешает", () => {
    expect(findTaskByKey(board, "ved-42")?.taskId).toBe("t2");
  });

  it("чужой или пропавший ключ ничего не открывает", () => {
    // Задачу могли перенести в другую среду или заархивировать — доска при
    // этом обязана просто показаться.
    expect(findTaskByKey(board, "VED-999")).toBeNull();
    expect(findTaskByKey(board, null)).toBeNull();
    expect(findTaskByKey(null, "VED-42")).toBeNull();
  });

  it("пустая доска не роняет поиск", () => {
    expect(findTaskByKey({ columns: [] }, "VED-42")).toBeNull();
  });
});
