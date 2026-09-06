import type { MotivationFeedResponse } from "@vedamatch/shared";

/**
 * Данные карточки «Вдохновения» на главной: цитата дня и сколько ещё нового.
 *
 * Карточка делает то же, что сервис, — даёт каплю вдохновения без перехода,
 * — а не показывает состояние. Отдельный модуль от компонента по той же
 * причине, что `union-quick-access`: выбор поста и обрезка — чистая логика,
 * и ошибка в ней видна тестом.
 */
export interface MotivationQuickAccessData {
  quote: {
    slug: string;
    /** Обрезанный текст: в карточке две строки, а не абзац. */
    text: string;
    /** «Бхагавад-гита 4.18» либо говорящий; null — источник не подписан. */
    attribution: string | null;
  } | null;
  /**
   * Сколько постов вышло после прошлого визита, не считая показанного.
   * 0 — строка «ещё N новых» не рисуется: это подсказка, что лента
   * обновилась, а не счётчик обязанностей.
   */
  freshMore: number;
}

/** Длиннее в две строки карточки не помещается ни на одном экране. */
export const QUOTE_MAX_LENGTH = 140;

/** Обрезка по слову, чтобы «…» не резало слово пополам. */
export function clampQuote(text: string, limit = QUOTE_MAX_LENGTH): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!?—-]+$/, "")}…`;
}

function attributionOf(post: MotivationFeedResponse["items"][number]): string | null {
  const work = post.attributionWork?.trim();
  const locator = post.attributionLocator?.trim();
  const speaker = post.attributionSpeaker?.trim();
  if (work) return locator ? `${work} ${locator}` : work;
  return speaker || null;
}

/**
 * Лента уже отсортирована ярусами: свежее → непросмотренное → повтор. Берём
 * первый пост — он и есть самое новое, чего человек не видел; когда лента
 * исчерпана, первым идёт повтор, и цитата всё равно есть. Пустая лента (новый
 * аккаунт, упавший сервис) — слота нет, карточка остаётся как была.
 */
export function buildMotivationQuickAccess(
  feed: MotivationFeedResponse | null,
): MotivationQuickAccessData {
  const items = feed?.items ?? [];
  const first = items[0];
  if (!first) return { quote: null, freshMore: 0 };

  const freshMore = items.filter(
    (post, index) => index > 0 && post.feedTier === "fresh",
  ).length;

  return {
    quote: {
      slug: first.slug,
      text: clampQuote(first.text || first.title),
      attribution: attributionOf(first),
    },
    freshMore,
  };
}
