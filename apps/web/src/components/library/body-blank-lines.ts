import type { LibraryLocale } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { t, type LibraryTextKey } from "./i18n";

/**
 * Уборка пустых строк в тексте статьи и катхи (VED-372, пункт «Сделай то же
 * самое для раздела Статья»).
 *
 * Сама уборка — портальная `collapseBlankLines` из `@vedamatch/shared`, та же,
 * что в форме поста блог-ленты. Здесь — только то, в чём «Образование»
 * отличается: какие варианты предлагать и как сказать итог на двух языках.
 *
 * Вариантов два, а не три, как в блоге. Сервер хранит текст материала не
 * больше чем с одной пустой строкой между абзацами (`normalizeEntryBody`
 * схлопывает `\n{3,}`), а страница материала и одну, и десять пустых строк
 * показывает одним отступом между абзацами (`kathaParagraphs`). Выбор «две»
 * обещал бы то, чего читатель не увидит, и молча превращался бы в «одну»
 * при сохранении.
 */
export const BODY_BLANK_LINES_KEEP_CHOICES = [0, 1] as const;

export type BodyBlankLinesKeep = (typeof BODY_BLANK_LINES_KEEP_CHOICES)[number];

/**
 * По умолчанию — ни одной, как в блоге: именно об этом просил заказчик
 * («убрать 1 и более пустых строчек между частями текста»).
 */
export const BODY_BLANK_LINES_DEFAULT_KEEP: BodyBlankLinesKeep = 0;

/** Словами, а не цифрами: список читается вслух вместе с подписью. */
export const BODY_BLANK_LINES_KEEP_LABELS: Record<
  BodyBlankLinesKeep,
  LibraryTextKey
> = {
  0: "blank.keep0",
  1: "blank.keep1",
};

/**
 * Что сказать человеку после уборки. Отдельной функцией, потому что у
 * русского три формы («убрана 1 пустая строка», «убрано 2 пустые строки»,
 * «убрано 5 пустых строк») и проверяются они тестом, а не глазами.
 */
export function bodyBlankLinesMessage(
  locale: LibraryLocale,
  removed: number,
): string {
  if (removed <= 0) return t(locale, "blank.nothing");
  if (locale === "en") {
    return `Removed ${removed} blank line${removed === 1 ? "" : "s"}.`;
  }
  return `${plural(removed, "Убрана", "Убрано", "Убрано")} ${removed} ${plural(
    removed,
    "пустая строка",
    "пустые строки",
    "пустых строк",
  )}.`;
}
