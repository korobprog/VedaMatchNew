import { describe, expect, it } from "vitest";
import { distinctAccents } from "./featured-accents";

describe("distinctAccents (VED-452)", () => {
  it("свои цвета, когда не совпадают", () => {
    expect(distinctAccents(["text-cyan", "text-violet", "text-gold"])).toEqual([
      "text-cyan",
      "text-violet",
      "text-gold",
    ]);
  });

  it("повтор получает первый свободный: Общение, Медиатека, Образование", () => {
    expect(distinctAccents(["text-cyan", "text-violet", "text-cyan"])).toEqual([
      "text-cyan",
      "text-violet",
      "text-magenta",
    ]);
  });

  it("три одинаковых — три разных", () => {
    const got = distinctAccents(["text-gold", "text-gold", "text-gold"]);
    expect(new Set(got).size).toBe(3);
    expect(got[0]).toBe("text-gold");
  });
});
