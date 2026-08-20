import { describe, expect, it } from "vitest";
import { parseJsonBody } from "./json-body";

describe("parseJsonBody", () => {
  it("разбирает обычный ответ", () => {
    expect(parseJsonBody<{ id: string }>('{"id":"a"}')).toEqual({ id: "a" });
  });

  it("отдаёт null на пустом теле вместо падения", () => {
    // Тот самый случай: контроллер вернул null, Nest прислал 200 без тела.
    expect(parseJsonBody("")).toBeNull();
  });

  it("не путает пустое тело с литералом null и с нулём", () => {
    expect(parseJsonBody("null")).toBeNull();
    expect(parseJsonBody("0")).toBe(0);
    expect(parseJsonBody("false")).toBe(false);
  });

  it("сохраняет массивы и вложенность", () => {
    expect(parseJsonBody('[{"a":[1,2]}]')).toEqual([{ a: [1, 2] }]);
  });

  it("не глотает битый JSON: это не пустое тело, а поломка", () => {
    expect(() => parseJsonBody("{oops")).toThrow();
  });
});
