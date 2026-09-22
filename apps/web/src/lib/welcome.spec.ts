import { describe, expect, it } from "vitest";
import { needsWelcome, welcomeHref, welcomeSteps } from "./welcome";

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

/**
 * Путь возврата обязан пережить мастер новичка.
 *
 * До VED-360 его не было вовсе: `redirect("/welcome")` терял `returnTo`, а
 * мастер заканчивался жёстким `push("/")`. Для ссылки на конференцию это
 * означало, что «зарегался и сразу в комнате» превращалось в «зарегался и
 * ищи сам» — ровно на том человеке, ради которого ссылку и присылали.
 */
describe("welcomeHref", () => {
  it("без пути возврата — просто мастер", () => {
    expect(welcomeHref(undefined)).toBe("/welcome");
    expect(welcomeHref(null)).toBe("/welcome");
    expect(welcomeHref("/")).toBe("/welcome");
  });

  it("ссылка на конференцию доезжает до мастера", () => {
    const token = "a".repeat(32);
    expect(welcomeHref(`/j/${token}`)).toBe(
      `/welcome?returnTo=${encodeURIComponent(`/j/${token}`)}`,
    );
  });

  it("путь с запросом не рассыпается", () => {
    expect(welcomeHref("/chat/c1?tab=call")).toBe(
      `/welcome?returnTo=${encodeURIComponent("/chat/c1?tab=call")}`,
    );
  });

  it.each(["//evil.example/x", "https://evil.example", "javascript:alert(1)"])(
    "чужой адрес (%s) в мастер не протащить",
    (hostile) => {
      expect(welcomeHref(hostile)).toBe("/welcome");
    },
  );
});
