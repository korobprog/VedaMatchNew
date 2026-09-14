import { describe, expect, it } from "vitest";
import { imageAspect, shouldStickToBottom } from "./image-frame";

describe("imageAspect (VED-148)", () => {
  it("даёт пропорцию кадра по размерам вложения", () => {
    expect(imageAspect(1280, 960)).toBe("1280 / 960");
  });

  it("без размеров — null: старые вложения их не хранили", () => {
    expect(imageAspect(null, 960)).toBeNull();
    expect(imageAspect(1280, undefined)).toBeNull();
    expect(imageAspect(0, 960)).toBeNull();
    expect(imageAspect(-1, 960)).toBeNull();
    expect(imageAspect(Number.NaN, 960)).toBeNull();
  });
});

describe("shouldStickToBottom (VED-148)", () => {
  it("человек был внизу — докручиваем к выросшей картинке", () => {
    // До роста до низа было 0 точек, картинка выросла на 288.
    expect(shouldStickToBottom({ distanceFromBottom: 288, grownBy: 288 })).toBe(true);
  });

  it("почти внизу — тоже докручиваем", () => {
    expect(shouldStickToBottom({ distanceFromBottom: 388, grownBy: 288 })).toBe(true);
  });

  it("листает историю выше — ленту не трогаем", () => {
    expect(shouldStickToBottom({ distanceFromBottom: 1500, grownBy: 288 })).toBe(false);
  });
});
