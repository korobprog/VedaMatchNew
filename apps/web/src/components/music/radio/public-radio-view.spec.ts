import { describe, expect, it } from "vitest";
import {
  radioAvatarStack,
  radioListenersLabel,
  radioPromoIndex,
} from "./public-radio-view";

/* VED-645: публичная страница радио — «нас много». */
describe("radioListenersLabel", () => {
  it("склоняет по числу", () => {
    expect(radioListenersLabel(1)).toBe("Сейчас слушает 1 человек");
    expect(radioListenersLabel(3)).toBe("Сейчас слушают 3 человека");
    expect(radioListenersLabel(12)).toBe("Сейчас слушают 12 человек");
    expect(radioListenersLabel(21)).toBe("Сейчас слушают 21 человек");
  });

  it("ноль — приглашение, а не «0 человек»", () => {
    expect(radioListenersLabel(0)).not.toMatch(/0/);
  });
});

describe("radioAvatarStack", () => {
  const photos = ["a", "b", "c", "d"];

  it("ниже порога аватарок нет", () => {
    expect(radioAvatarStack(photos, 2)).toBeNull();
  });

  it("без фото аватарок нет", () => {
    expect(radioAvatarStack([], 40)).toBeNull();
  });

  it("остальные слушатели — кружком «+N»", () => {
    expect(radioAvatarStack(photos, 30)).toEqual({ avatars: photos, rest: 26 });
    expect(radioAvatarStack(photos, 4)).toEqual({ avatars: photos, rest: 0 });
  });
});

describe("radioPromoIndex", () => {
  it("один и тот же слот — один и тот же баннер, в пределах списка", () => {
    const index = radioPromoIndex("slot-42", 5);
    expect(index).toBe(radioPromoIndex("slot-42", 5));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
  });

  it("без эфира — первый баннер", () => {
    expect(radioPromoIndex(null, 5)).toBe(0);
    expect(radioPromoIndex("x", 0)).toBe(0);
  });
});
