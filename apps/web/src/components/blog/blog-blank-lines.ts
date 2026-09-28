import { collapseBlankLines, type BlankLinesResult } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Уборка пустых строк в тексте поста (VED-372).
 *
 * Заказчик: «Нужна в первую очередь функция — Убрать 1 и более (должно быть
 * настраиваемо) пустых строчек между частями текста. На скриншоте виден
 * разорванный текст, это некрасиво».
 *
 * Текст в ленту почти всегда приезжает вставкой из мессенджера, заметок или
 * PDF, и вместе с ним приезжают пустые строки между абзацами — иногда по
 * несколько. Сервер схлопывает только подряд идущие переводы строки
 * (`\n{3,}`), а вставленный текст чаще состоит из строк с пробелами и
 * табуляциями: для регулярного выражения это не пустая строка, для человека
 * — дыра в тексте. Поэтому здесь пустой считается строка без видимых
 * знаков.
 *
 * Инструмент ручной: кнопка в форме, результат виден сразу, отмена
 * возвращает прежний текст. Молча переписывать чужой текст при сохранении
 * нельзя — это его слова, а не наши.
 */

/**
 * Сколько пустых строк убрать из каждого промежутка между абзацами (VED-633):
 * «одна кнопка „Убрать“, нажимая на которую вылезает опция — сколько линий
 * надо убрать — 1–3 и все». Прежний выбор «оставлять ни одной / одну» стоял
 * рядом развёрнутым полем и занимал пол-экрана формы.
 */
export type BlogBlankLinesRemove = 1 | 2 | 3 | "all";

export const BLOG_BLANK_LINES_REMOVE_CHOICES: readonly BlogBlankLinesRemove[] =
  [1, 2, 3, "all"];

/** Подпись пункта меню: действие целиком, чтобы читалось и вслух. */
export function blogBlankLinesChoiceLabel(
  choice: BlogBlankLinesRemove,
): string {
  if (choice === "all") return "Убрать все";
  return `Убрать ${choice} ${plural(choice, "строку", "строки", "строк")}`;
}

/**
 * Сама уборка — портальная функция из `@vedamatch/shared` (VED-372, вынесена
 * при переносе в «Образование»): ею же пользуется форма статьи, и копия здесь
 * разошлась бы с ней на первой же правке. Имена прежние, чтобы форма поста и
 * её тесты не заметили переезда.
 */
export { collapseBlankLines };
export type BlogBlankLinesResult = BlankLinesResult;

/**
 * Убрать из каждого промежутка между абзацами по `count` пустых строк
 * (`"all"` — все). Промежуток из двух пустых строк при «убрать одну»
 * становится одной, из одной — исчезает. Пустота в начале и в конце текста
 * ничего не разделяет и уходит всегда, как и в `collapseBlankLines`; «пустая»
 * — строка без видимых знаков, оставленная очищается от пробелов.
 */
export function removeBlankLines(
  value: string,
  count: BlogBlankLinesRemove,
): BlogBlankLinesResult {
  if (count === "all") return collapseBlankLines(value, 0);
  const normalized = value.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let pending = 0;
  let seenContent = false;
  for (const line of lines) {
    if (line.trim() === "") {
      pending += 1;
      continue;
    }
    if (seenContent) {
      for (let index = 0; index < pending - count; index += 1) out.push("");
    }
    pending = 0;
    seenContent = true;
    out.push(line);
  }
  const text = out.join("\n");
  return { text, removed: text === normalized ? 0 : lines.length - out.length };
}

/**
 * Что сказать человеку после уборки. Отдельной функцией, потому что
 * склонения здесь три («убрана 1 пустая строка», «убрано 2 пустые строки»,
 * «убрано 5 пустых строк») и проверяются тестом, а не глазами в разметке.
 */
export function blogBlankLinesMessage(removed: number): string {
  if (removed <= 0) return "Пустых строк между абзацами не нашлось.";
  return `${plural(removed, "Убрана", "Убрано", "Убрано")} ${removed} ${plural(
    removed,
    "пустая строка",
    "пустые строки",
    "пустых строк",
  )}.`;
}
