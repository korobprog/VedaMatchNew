import { describe, expect, it } from "vitest";
import {
  FEATURED_PALETTE,
  assignFeaturedAccent,
  distinctAccents,
  parseFeaturedColors,
  resolveFeaturedAccents,
  serializeFeaturedColors,
  type FeaturedAccent,
} from "./featured-accents";

const DEFAULT_THREE: FeaturedAccent[] = [
  "text-cyan",
  "text-violet",
  "text-magenta",
];

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

describe("цвет кнопки на выбор (VED-452, круг 3)", () => {
  it("палитра: три основных, золотой и два предложенных", () => {
    expect(FEATURED_PALETTE).toEqual([
      "text-cyan",
      "text-violet",
      "text-magenta",
      "text-gold",
      "text-blue",
      "text-lime",
    ]);
  });

  it("без выбора человека — только три основных цвета", () => {
    const got = distinctAccents(["text-cyan", "text-cyan", "text-cyan"]);
    expect(got.every((c) => DEFAULT_THREE.includes(c))).toBe(true);
  });

  it("выбранный цвет места сильнее любимого цвета сервиса", () => {
    expect(
      resolveFeaturedAccents(
        ["text-cyan", "text-violet", "text-cyan"],
        ["text-gold", null, "text-lime"],
      ),
    ).toEqual(["text-gold", "text-violet", "text-lime"]);
  });

  it("выбор человека держит место, а сервис без выбора берёт свободный", () => {
    // Второй хочет свой фиолетовый, но его выбрал человек для первой.
    expect(
      resolveFeaturedAccents(
        ["text-cyan", "text-violet", "text-magenta"],
        ["text-violet", null, null],
      ),
    ).toEqual(["text-violet", "text-cyan", "text-magenta"]);
  });

  it("чужой цвет у соседа — меняются цветами", () => {
    expect(
      assignFeaturedAccent(
        ["text-cyan", "text-violet", "text-magenta"],
        0,
        "text-magenta",
      ),
    ).toEqual(["text-magenta", "text-violet", "text-cyan"]);
    expect(
      assignFeaturedAccent(
        ["text-cyan", "text-violet", "text-magenta"],
        1,
        "text-gold",
      ),
    ).toEqual(["text-cyan", "text-gold", "text-magenta"]);
  });

  it("cookie: свой пользователь читается, чужой и битый — нет", () => {
    const raw = serializeFeaturedColors("u1", [
      "text-gold",
      "text-blue",
      "text-lime",
    ]);
    expect(parseFeaturedColors(raw, "u1")).toEqual([
      "text-gold",
      "text-blue",
      "text-lime",
    ]);
    expect(parseFeaturedColors(raw, "u2")).toBeNull();
    expect(parseFeaturedColors("%E0%A4%A", "u1")).toBeNull();
    expect(
      parseFeaturedColors(encodeURIComponent("u1|red,,gold"), "u1"),
    ).toEqual([null, null, "text-gold"]);
    expect(parseFeaturedColors(encodeURIComponent("u1|red"), "u1")).toBeNull();
  });
});
