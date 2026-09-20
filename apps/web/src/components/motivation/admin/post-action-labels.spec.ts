import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX,
  allActionLabels,
  deleteActionLabel,
  editActionLabel,
  feedActionLabel,
  hideActionLabel,
  hideNoticeText,
  hiddenTabActionLabel,
  readActionLabel,
  searchActionLabel,
  titleOf,
  uploadActionLabel,
} from "./post-action-labels";

const states = ["published", "hidden"] as const;

describe("подписи кнопок карточки редакции (VED-251)", () => {
  it("у каждой кнопки есть видимая подпись, а не один значок", () => {
    // Ради этого модуль и появился: значок без слова редакция читать не
    // обязана, а `title` на телефоне не показывается никогда.
    for (const status of states)
      for (const action of allActionLabels({ status })) {
        expect(action.caption.trim()).not.toBe("");
        expect(action.label.trim()).not.toBe("");
      }
  });

  it("подпись влезает в клетку сетки", () => {
    for (const status of states)
      for (const action of allActionLabels({ status }))
        expect(action.caption.length).toBeLessThanOrEqual(CAPTION_MAX);
  });

  it("подпись не спорит с тем, что услышит скринридер", () => {
    // Короткая подпись — часть полной фразы, а не другое слово: иначе
    // глазами читают одно, а голосом слышат другое.
    for (const status of states)
      for (const action of allActionLabels({ status }))
        expect(action.label.toLocaleLowerCase("ru-RU")).toContain(
          action.caption.replace("…", "").toLocaleLowerCase("ru-RU"),
        );
  });

  it("перечёркнутый глаз говорит про ленту, а не просто «скрыть»", () => {
    expect(hideActionLabel(false).label).toBe("Скрыть из ленты");
    expect(hideActionLabel(true).label).toBe("Вернуть в ленту");
  });

  it("обратное действие подписано зеркально — отмену ищут там же", () => {
    expect(hideActionLabel(true)).not.toEqual(hideActionLabel(false));
    expect(editActionLabel(true)).not.toEqual(editActionLabel(false));
    expect(readActionLabel(true)).not.toEqual(readActionLabel(false));
    expect(uploadActionLabel(true)).not.toEqual(uploadActionLabel(false));
  });

  it("у скрытой карточки «в ленту» объясняет, почему не работает", () => {
    // Ссылки у скрытого поста нет: публичная лента ищет по слагу только
    // среди опубликованных. Кнопка остаётся на месте, но говорит, что
    // сделать сначала.
    expect(feedActionLabel(true, false).label).toBe(
      "Скрыто — сначала верните в ленту",
    );
    expect(feedActionLabel(true, true).label).toBe(
      "Скрыто — сначала верните в ленту",
    );
  });

  it("у видимой карточки «в ленту» различает открыть и вернуться", () => {
    expect(feedActionLabel(false, false).label).toBe("Открыть в ленте");
    expect(feedActionLabel(false, true).label).toBe("Вернуться в ленту");
  });

  it("подсказка добавляет к фразе, а не повторяет её", () => {
    expect(titleOf(searchActionLabel)).toBe("Поиск по цитате или автору");
    expect(titleOf(hiddenTabActionLabel)).toBe("Все скрытые афоризмы");
    // Там, где добавить нечего, подсказка — та же фраза, а не пустота.
    expect(titleOf(deleteActionLabel)).toBe("Удалить");
    expect(titleOf(hideActionLabel(false))).toBe("Скрыть из ленты");
  });

  it("после скрытия называет оба пути назад", () => {
    const notice = hideNoticeText(true);
    expect(notice).toContain("этой же кнопкой");
    expect(notice).toContain("Скрытые");
  });

  it("после возврата в ленту подсказки нет — отменять нечего", () => {
    expect(hideNoticeText(false)).toBeNull();
  });
});
