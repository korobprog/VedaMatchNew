import { describe, expect, it } from "vitest";
import {
  HOME_PANEL_DEFAULT_ORDER,
  movePanelButton,
  normalizePanelOrder,
} from "./home-panel-order";

describe("порядок кнопок панели Блог-ленты (VED-497)", () => {
  it("пусто или мусор — порядок по умолчанию", () => {
    expect(normalizePanelOrder(null)).toEqual(HOME_PANEL_DEFAULT_ORDER);
    expect(normalizePanelOrder("share")).toEqual(HOME_PANEL_DEFAULT_ORDER);
  });

  it("сохранённое сверху, незнакомое и повторы — мимо, новое — в конец", () => {
    const order = normalizePanelOrder(["hide", "share", "hide", "мусор"]);
    expect(order.slice(0, 2)).toEqual(["hide", "share"]);
    expect(order).toHaveLength(HOME_PANEL_DEFAULT_ORDER.length);
    expect(new Set(order).size).toBe(order.length);
  });

  it("кнопку нельзя убрать — только переставить", () => {
    const order = normalizePanelOrder(["write"]);
    expect([...order].sort()).toEqual([...HOME_PANEL_DEFAULT_ORDER].sort());
  });

  it("сдвиг на шаг, у края — без изменений", () => {
    const order = [...HOME_PANEL_DEFAULT_ORDER];
    expect(movePanelButton(order, "write", -1).slice(0, 2)).toEqual([
      "write",
      "calendar",
    ]);
    expect(movePanelButton(order, "calendar", -1)).toEqual(order);
    expect(movePanelButton(order, "hide", 1)).toEqual(order);
  });
});
