import { describe, expect, it } from "vitest";
import {
  oppositeGenderHref,
  oppositeGenderLabel,
  toggledHref,
} from "./union-toggle-link";

/* VED-652: «Показать всех» и «Избранное» — переключатели в адресе. */
describe("toggledHref", () => {
  it("включает параметр и сбрасывает страницу", () => {
    expect(
      toggledHref(
        "/union/recommendations",
        { page: "3", stage: "devotee" },
        "gender",
        "all",
      ),
    ).toBe("/union/recommendations?stage=devotee&gender=all");
  });

  it("повторный клик выключает", () => {
    expect(
      toggledHref("/union/recommendations", { gender: "all" }, "gender", "all"),
    ).toBe("/union/recommendations");
  });

  it("другое значение параметра заменяется включённым", () => {
    expect(
      toggledHref(
        "/union/recommendations",
        { gender: "male" },
        "gender",
        "all",
      ),
    ).toBe("/union/recommendations?gender=all");
  });
});

/* VED-673: «Противоположный пол» — снять выбранный вручную пол. */
describe("oppositeGenderHref", () => {
  it("убирает пол и страницу, остальное оставляет", () => {
    expect(
      oppositeGenderHref("/union/recommendations", {
        gender: "all",
        page: "2",
        stage: "devotee",
      }),
    ).toBe("/union/recommendations?stage=devotee");
    expect(oppositeGenderHref("/union/recommendations", {})).toBe(
      "/union/recommendations",
    );
  });
});

/* VED-673: надпись кнопки — «Женщины» мужчине и «Мужчины» женщине. */
describe("oppositeGenderLabel", () => {
  it("мужчине — «Женщины», женщине — «Мужчины»", () => {
    expect(oppositeGenderLabel("male")).toBe("Женщины");
    expect(oppositeGenderLabel("female")).toBe("Мужчины");
  });

  it("без определённого пола остаётся «Противоположный пол»", () => {
    expect(oppositeGenderLabel(null)).toBe("Противоположный пол");
    expect(oppositeGenderLabel(undefined)).toBe("Противоположный пол");
  });
});
