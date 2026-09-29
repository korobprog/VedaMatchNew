import { describe, expect, it } from "vitest";
import { toggledHref } from "./union-toggle-link";

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
