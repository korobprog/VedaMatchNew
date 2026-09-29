import { describe, expect, it } from "vitest";
import {
  radioAvatarStack,
  radioClock,
  radioProgress,
  radioListenersLabel,
  radioListenersNote,
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

describe("radioProgress", () => {
  const item = { startsAt: "2026-09-29T10:00:00.000Z", durationMs: 200_000 };
  const start = Date.parse(item.startsAt);

  it("доля отзвучавшего", () => {
    expect(radioProgress(item, start + 50_000)).toBe(0.25);
  });

  it("не выходит за 0…1 и терпит пустой эфир", () => {
    expect(radioProgress(item, start - 5_000)).toBe(0);
    expect(radioProgress(item, start + 999_000)).toBe(1);
    expect(radioProgress(null, start)).toBe(0);
  });
});

describe("radioClock", () => {
  it("часы и минуты по местному времени", () => {
    const local = new Date(2026, 8, 29, 9, 5);
    expect(radioClock(local.toISOString())).toBe("09:05");
  });
});

describe("radioListenersNote", () => {
  it("два имени, остальные числом и города", () => {
    expect(radioListenersNote(["Нитай", "Радха"], 12, 5)).toBe(
      "Нитай, Радха и ещё 10 человек из 5 городов",
    );
    expect(radioListenersNote(["Нитай", "Радха"], 4, 21)).toBe(
      "Нитай, Радха и ещё 2 человека из 21 города",
    );
  });

  it("все названы — без «ещё»; один город — без городов", () => {
    expect(radioListenersNote(["Нитай", "Радха", "Гопал"], 3, 1)).toBe(
      "Нитай, Радха и Гопал",
    );
  });

  it("мало слушателей или некого назвать — строки нет", () => {
    expect(radioListenersNote(["Нитай"], 2, 3)).toBeNull();
    expect(radioListenersNote([], 30, 3)).toBeNull();
  });
});
