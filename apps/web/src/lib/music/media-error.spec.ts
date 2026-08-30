import { describe, expect, it } from "vitest";
import {
  mediaErrorText,
  playRejectionText,
  stalledVerdict,
} from "./media-error";

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

describe("stalledVerdict", () => {
  it("начало не пришло — это отказ", () => {
    expect(stalledVerdict({ readyState: 0, currentTime: 0 })).toBe("failed");
  });

  it("играло и упёрлось в пустой буфер — не отказ", () => {
    // Звук вернётся сам; сообщение об ошибке убило бы то, что ещё живо.
    expect(stalledVerdict({ readyState: 1, currentTime: 42 })).toBe(
      "buffering",
    );
  });

  it("данные есть, но с нулевой секунды — тоже не отказ", () => {
    // Перемотка в самое начало обнуляет `currentTime`, а буфер остаётся.
    expect(stalledVerdict({ readyState: 3, currentTime: 0 })).toBe(
      "buffering",
    );
  });
});

describe("playRejectionText", () => {
  const rejection = (name: string) => new DOMException("", name);

  it("запрет автозапуска зовёт нажать ещё раз", () => {
    // Единственный след запрета — отклонённый промис: события `error` у
    // элемента нет, и без этой подписи человек видит вечную вертушку.
    const text = playRejectionText(rejection("NotAllowedError"));
    expect(text).toMatch(/нажмите/i);
  });

  it("прерывание сменой записи молчит", () => {
    expect(playRejectionText(rejection("AbortError"))).toBe("");
  });

  it("неподдерживаемый источник совпадает с подписью элемента", () => {
    // Причина одна и та же — и звучать она обязана одинаково, откуда бы ни
    // пришла: из `MediaError` или из отклонённого `play()`.
    expect(playRejectionText(rejection("NotSupportedError"))).toBe(
      mediaErrorText({ code: 4 } as MediaError),
    );
  });

  it("незнакомый отказ не роняет и не молчит", () => {
    expect(playRejectionText(rejection("WeirdError"))).toBe(
      "Не удалось включить запись",
    );
    expect(playRejectionText(undefined)).toBe("Не удалось включить запись");
  });
});
