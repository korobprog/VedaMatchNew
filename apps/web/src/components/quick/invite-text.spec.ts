import { describe, expect, it } from "vitest";
import {
  inviteDraftState,
  inviteSaveErrorText,
  normalizeInviteDraft,
} from "./invite-text";

describe("normalizeInviteDraft", () => {
  it("приводит переводы строк и срезает края, как сервер", () => {
    expect(normalizeInviteDraft("  а\r\nб\rв \n")).toBe("а\nб\nв");
  });
});

describe("inviteDraftState", () => {
  it("считает длину после нормализации", () => {
    expect(inviteDraftState("  ab\r\n", 10)).toEqual({
      length: 2,
      tooLong: false,
      resetsToDefault: false,
    });
  });

  it("длиннее потолка — нельзя сохранить", () => {
    expect(inviteDraftState("abc", 2).tooLong).toBe(true);
    expect(inviteDraftState("ab", 2).tooLong).toBe(false);
  });

  it("пустое поле вернёт текст по умолчанию", () => {
    expect(inviteDraftState(" \n ", 10).resetsToDefault).toBe(true);
  });
});

describe("inviteSaveErrorText", () => {
  it("берёт message из ответа Nest", () => {
    expect(
      inviteSaveErrorText(
        '{"statusCode":400,"message":"Текст длиннее 3500 символов"}',
      ),
    ).toBe("Текст длиннее 3500 символов");
    expect(inviteSaveErrorText('{"message":["а","б"]}')).toBe("а, б");
  });

  it("на непонятный ответ — общий текст, а не сырой ответ", () => {
    expect(inviteSaveErrorText("<html>502</html>")).toMatch(/Не удалось/);
    expect(inviteSaveErrorText("")).toMatch(/Не удалось/);
    expect(inviteSaveErrorText('{"x":1}')).toMatch(/Не удалось/);
  });
});
