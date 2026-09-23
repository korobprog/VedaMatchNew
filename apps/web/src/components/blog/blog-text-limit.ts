import { BLOG_POST_TEXT_MAX_LENGTH } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Счётчик текста поста (VED-371).
 *
 * До этого у поля стоял только `maxLength`: браузер молча перестаёт
 * принимать знаки, а вставленный длинный текст так же молча обрезается с
 * конца. Человек не видел ни предела, ни того, что часть текста не доехала.
 * Поэтому `maxLength` у текста убран, вместо него — эта подпись и отказ
 * отправить форму, пока текст не влезает.
 *
 * Считаем то же, что считает сервер: переводы строк приводим к `\n` и режем
 * пробелы по краям (`normalizeText` в `blog-validate.ts`). Сервер вдобавок
 * схлопывает подряд идущие пустые строки, то есть его число не больше
 * нашего: расхождение всегда в сторону «мы предупредили раньше», а не
 * «сервер отказал молча».
 */

export type BlogTextLimitTone = "quiet" | "warn" | "over";

export interface BlogTextLimitState {
  /** Сколько знаков уже занято по счёту сервера. */
  used: number;
  /** Сколько осталось; отрицательного не бывает — см. `overBy`. */
  remaining: number;
  /** На сколько знаков перебор; 0 — перебора нет. */
  overBy: number;
  over: boolean;
  /** Подпись под полем. */
  label: string;
  tone: BlogTextLimitTone;
}

/** С этого остатка подпись становится предупреждением, а не справкой. */
export const BLOG_TEXT_LIMIT_WARN_AT = 1000;

export function blogTextLimitState(
  value: string,
  max: number = BLOG_POST_TEXT_MAX_LENGTH,
): BlogTextLimitState {
  const used = value.replace(/\r\n?/g, "\n").trim().length;
  const remaining = Math.max(0, max - used);
  const overBy = Math.max(0, used - max);

  if (overBy > 0) {
    return {
      used,
      remaining,
      overBy,
      over: true,
      label: `${plural(overBy, "Лишний", "Лишних", "Лишних")} ${overBy} ${plural(
        overBy,
        "знак",
        "знака",
        "знаков",
      )} — столько нужно убрать.`,
      tone: "over",
    };
  }
  if (remaining <= BLOG_TEXT_LIMIT_WARN_AT) {
    return {
      used,
      remaining,
      overBy: 0,
      over: false,
      label: `Осталось ${remaining} ${plural(remaining, "знак", "знака", "знаков")}.`,
      tone: "warn",
    };
  }
  return {
    used,
    remaining,
    overBy: 0,
    over: false,
    label: `${used} из ${max}`,
    tone: "quiet",
  };
}
