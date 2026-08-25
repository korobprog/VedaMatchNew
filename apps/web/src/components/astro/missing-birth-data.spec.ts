import { describe, expect, it } from "vitest";
import {
  BIRTH_DATA_URL,
  birthDataHint,
  isMissingBirthDataError,
} from "./missing-birth-data";

describe("isMissingBirthDataError", () => {
  // Ровно та формулировка, которой отвечает сервер (см.
  // astro-compatibility.service.ts): и при создании запроса, и при согласии.
  it("recognises the server wording", () => {
    expect(
      isMissingBirthDataError("Сначала заполните собственные данные рождения"),
    ).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(isMissingBirthDataError("Не удалось ответить")).toBe(false);
    expect(isMissingBirthDataError("Запрос уже отправлен")).toBe(false);
    expect(isMissingBirthDataError(null)).toBe(false);
    expect(isMissingBirthDataError("")).toBe(false);
  });
});

describe("birthDataHint", () => {
  it("points to where the data is filled in", () => {
    const hint = birthDataHint("Сначала заполните собственные данные рождения");

    expect(hint?.href).toBe(BIRTH_DATA_URL);
    expect(hint?.action).toBe("Заполнить данные рождения");
    expect(hint?.text).toMatch(/двум картам/);
  });

  // Риск: предложить «заполнить данные» на сбое сети. Действие, не решающее
  // проблему, хуже честного отсутствия действия — человек уйдёт заполнять
  // уже заполненное и вернётся к той же ошибке.
  it("offers nothing when the failure is not about birth data", () => {
    expect(birthDataHint("Не удалось ответить")).toBeNull();
    expect(birthDataHint(null)).toBeNull();
  });
});
