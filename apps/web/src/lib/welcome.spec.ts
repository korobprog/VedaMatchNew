import { describe, expect, it } from "vitest";
import { needsWelcome, welcomeSteps } from "./welcome";

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

/**
 * Набор шагов считает и серверная страница `/welcome`, и сам мастер. Пока
 * функция жила в модуле мастера с `"use client"`, страница падала на первом
 * же вызове — здесь она рядом с `needsWelcome` и общая для обоих.
 */
describe("welcomeSteps", () => {
  it("новичку показывает все шаги", () => {
    expect(welcomeSteps({ spiritualStage: null })).toEqual([
      "Знакомство",
      "Город",
      "Фото",
      "Этап пути",
    ]);
  });

  // Анкету старому аккаунту не переигрываем: ответы по умолчанию переписали
  // бы уже определённый этап пути.
  it("аккаунту с этапом пути оставляет один шаг", () => {
    expect(welcomeSteps({ spiritualStage: "practitioner" })).toEqual([
      "Знакомство",
    ]);
  });
});
