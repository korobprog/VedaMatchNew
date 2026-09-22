import { describe, expect, it } from "vitest";
import {
  WORK_TOOLBAR_BUTTON_BASE,
  workToolbarButtonClass,
} from "./toolbar-button";

/** Классы строкой — сравнивать удобнее множеством, порядок ничего не значит. */
function classes(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

describe("workToolbarButtonClass", () => {
  it("рамка есть у любой кнопки ряда — и в покое, и нажатой", () => {
    for (const pressed of [false, true]) {
      expect(classes(workToolbarButtonClass({ pressed }))).toContain("border");
    }
  });

  it("рамка задана ровно одним классом цвета — без второго поверх", () => {
    const idle = [...classes(workToolbarButtonClass())].filter((name) =>
      name.startsWith("border-"),
    );
    const pressed = [...classes(workToolbarButtonClass({ pressed: true }))].filter(
      (name) => name.startsWith("border-"),
    );
    expect(idle).toEqual(["border-glass-brd"]);
    expect(pressed).toEqual(["border-cyan"]);
  });

  it("нажатие меняет только цвет — форма и область нажатия те же", () => {
    const idle = classes(workToolbarButtonClass());
    const pressed = classes(workToolbarButtonClass({ pressed: true }));
    for (const shared of classes(WORK_TOOLBAR_BUTTON_BASE)) {
      expect(idle).toContain(shared);
      expect(pressed).toContain(shared);
    }
  });

  it("область нажатия не меньше 40 точек по обеим сторонам", () => {
    const base = classes(WORK_TOOLBAR_BUTTON_BASE);
    expect(base).toContain("min-h-10");
    expect(base).toContain("min-w-10");
  });

  it("цвета только токенами — без хардкода #RRGGBB", () => {
    expect(workToolbarButtonClass({ pressed: true })).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(workToolbarButtonClass()).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("добавочные классы дописываются последними и не ломают общую часть", () => {
    const value = workToolbarButtonClass({ extra: "sm:hidden" });
    expect(value.endsWith("sm:hidden")).toBe(true);
    expect(classes(value)).toContain("border-glass-brd");
  });

  it("пустой `extra` не оставляет хвоста из пробелов", () => {
    expect(workToolbarButtonClass({ extra: "   " })).toBe(
      workToolbarButtonClass(),
    );
  });
});
