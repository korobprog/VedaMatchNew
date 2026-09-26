import { describe, expect, it } from "vitest";
import {
  POST_ACTIONS_DEFAULT_ORDER,
  movePostAction,
  normalizePostActionsOrder,
  parsePostActionsOrder,
} from "./post-actions-order";

describe("порядок кнопок под постом (VED-509)", () => {
  it("пусто, мусор или битая строка — порядок по умолчанию", () => {
    expect(parsePostActionsOrder(null)).toEqual(POST_ACTIONS_DEFAULT_ORDER);
    expect(parsePostActionsOrder("{не json")).toEqual(
      POST_ACTIONS_DEFAULT_ORDER,
    );
    expect(normalizePostActionsOrder("copy")).toEqual(
      POST_ACTIONS_DEFAULT_ORDER,
    );
  });

  it("сохранённое сверху, незнакомое и повторы — мимо, новое — в конец", () => {
    const order = parsePostActionsOrder(
      JSON.stringify(["delete", "copy", "delete", "мусор"]),
    );
    expect(order.slice(0, 2)).toEqual(["delete", "copy"]);
    expect(order).toHaveLength(POST_ACTIONS_DEFAULT_ORDER.length);
    expect(new Set(order).size).toBe(order.length);
  });

  it("сдвиг на шаг, у края — без изменений", () => {
    const order = [...POST_ACTIONS_DEFAULT_ORDER];
    expect(movePostAction(order, "copy", -1).slice(1, 3)).toEqual([
      "copy",
      "speak",
    ]);
    expect(movePostAction(order, "like", -1)).toEqual(order);
    expect(movePostAction(order, "delete", 1)).toEqual(order);
  });

  it("«Нравится» (VED-505) у сохранённого раньше порядка встаёт в конец", () => {
    const saved = POST_ACTIONS_DEFAULT_ORDER.filter((id) => id !== "like");
    const order = parsePostActionsOrder(JSON.stringify(saved));
    expect(order[order.length - 1]).toBe("like");
    expect(POST_ACTIONS_DEFAULT_ORDER[0]).toBe("like");
  });
});
