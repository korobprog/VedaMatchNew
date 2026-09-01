import { describe, expect, it } from "vitest";
import { needsWelcome } from "./welcome";

/**
 * Условие редиректа в мастер проверяют пять страниц. Тест сторожит именно
 * его: разъехавшись, они гоняли бы человека между главной и мастером.
 */
describe("needsWelcome", () => {
  it("новичок без этапа пути идёт в мастер", () => {
    expect(needsWelcome({ spiritualStage: null, gender: "male" })).toBe(true);
  });

  it("старый аккаунт без пола тоже идёт в мастер", () => {
    expect(needsWelcome({ spiritualStage: "practitioner", gender: null })).toBe(
      true,
    );
  });

  it("заполнившего мастер больше не трогает", () => {
    expect(
      needsWelcome({ spiritualStage: "practitioner", gender: "female" }),
    ).toBe(false);
  });
});
