import { describe, expect, it } from "vitest";
import { mediaErrorText } from "./media-error";

const err = (code: number) => ({ code }) as MediaError;

describe("mediaErrorText", () => {
  it("без ошибки — общая подпись, а не пустота", () => {
    expect(mediaErrorText(null)).toBe("Не удалось включить запись");
  });

  it("прерывание человеком не считается отказом", () => {
    // Переключил запись сам — показывать ему ошибку не за что.
    expect(mediaErrorText(err(1))).toBe("");
  });

  it("сеть — предлагает повторить", () => {
    expect(mediaErrorText(err(2))).toMatch(/сеть/i);
  });

  it("повреждённый файл отличается от неподдерживаемого", () => {
    expect(mediaErrorText(err(3))).not.toBe(mediaErrorText(err(4)));
  });

  it("неподдерживаемый источник называет обе причины", () => {
    // Код 4 приходит и на 404 из хранилища, и на чужой формат — подпись не
    // имеет права утверждать что-то одно.
    const text = mediaErrorText(err(4));
    expect(text).toMatch(/не загрузил/i);
    expect(text).toMatch(/формат/i);
  });

  it("незнакомый код не роняет и не молчит", () => {
    expect(mediaErrorText(err(99))).toBe("Не удалось включить запись");
  });
});
