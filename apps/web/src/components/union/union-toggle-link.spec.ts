import { describe, expect, it } from "vitest";
import {
  effectiveGenderFilter,
  everyoneHref,
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

/* VED-673: кнопки панели — те же режимы, что считает сервер. */
describe("everyoneHref / oppositeGenderHref", () => {
  it("«Показать всех» снимает молчаливые сужения и задаёт пол «все»", () => {
    expect(
      everyoneHref("/union/recommendations", {
        gender: "female",
        page: "2",
        stage: "devotee",
      }),
    ).toBe(
      "/union/recommendations?stage=devotee&gender=all&showAll=true",
    );
  });

  it("«Женщины» мужчине — весь женский пол, а не часть выдачи", () => {
    expect(
      oppositeGenderHref(
        "/union/recommendations",
        { gender: "all", page: "2", stage: "devotee" },
        "male",
      ),
    ).toBe(
      "/union/recommendations?stage=devotee&gender=female&showAll=true",
    );
  });

  it("без известного пола смотрящего пол не задаётся", () => {
    expect(oppositeGenderHref("/union/recommendations", {})).toBe(
      "/union/recommendations?showAll=true",
    );
  });
});

/* VED-673: подсветка кнопки — по тому, что реально показано. */
describe("effectiveGenderFilter", () => {
  it("явный пол побеждает режим «показать всё»", () => {
    expect(
      effectiveGenderFilter({ gender: "female", showAll: "true" }, "male"),
    ).toBe("female");
  });

  it("«показать всё» без пола показывает всех — «Женщины» не горит", () => {
    expect(effectiveGenderFilter({ showAll: "true" }, "male")).toBe("all");
    expect(effectiveGenderFilter({ gender: "all" }, "male")).toBe("all");
  });

  it("без параметров — противоположный пол смотрящего", () => {
    expect(effectiveGenderFilter({}, "male")).toBe("female");
    expect(effectiveGenderFilter({}, "female")).toBe("male");
    expect(effectiveGenderFilter({}, null)).toBe("all");
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
