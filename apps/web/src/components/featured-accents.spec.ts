import { describe, expect, it } from "vitest";
import { distinctAccents } from "./featured-accents";

describe("distinctAccents (VED-452)", () => {
  it("свои цвета, когда не совпадают", () => {
    expect(
      distinctAccents(["text-magenta", "text-violet", "text-cyan"]),
    ).toEqual(["text-magenta", "text-violet", "text-cyan"]);
  });

  it("повтор получает первый свободный: Общение, Медиатека, Образование", () => {
    expect(distinctAccents(["text-cyan", "text-violet", "text-cyan"])).toEqual([
      "text-cyan",
      "text-violet",
      "text-magenta",
    ]);
  });

  it("три одинаковых — три разных", () => {
    const got = distinctAccents(["text-violet", "text-violet", "text-violet"]);
    expect(new Set(got).size).toBe(3);
    expect(got[0]).toBe("text-violet");
  });

  it("всего три цвета: мятный, фиолетовый, малиновый", () => {
    const got = distinctAccents(["text-cyan", "text-cyan", "text-cyan"]);
    expect([...got].sort()).toEqual([
      "text-cyan",
      "text-magenta",
      "text-violet",
    ]);
  });
});
