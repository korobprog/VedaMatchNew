import { describe, expect, it } from "vitest";
import { liftButtonLabel, parseLifted, serializeLifted } from "./player-lift";

describe("player-lift", () => {
  it("поднята только при сохранённой «1»", () => {
    expect(parseLifted("1")).toBe(true);
    expect(parseLifted("0")).toBe(false);
    expect(parseLifted(null)).toBe(false);
    expect(parseLifted("true")).toBe(false);
  });

  it("запись и чтение сходятся", () => {
    expect(parseLifted(serializeLifted(true))).toBe(true);
    expect(parseLifted(serializeLifted(false))).toBe(false);
  });

  it("имя кнопки называет действие", () => {
    expect(liftButtonLabel(false)).toMatch(/^Поднять/);
    expect(liftButtonLabel(true)).toMatch(/^Опустить/);
  });
});
