import type {
  MotivationCategoryDto,
  MotivationFeedResponse,
} from "@vedamatch/shared";
import { buildMotivationQuickAccess } from "./motivation-quick-access";

/**
 * Откуда карточка «Вдохновения» на главной берёт афоризм (VED-79).
 *
 * Раньше это была личная лента человека: первым шёл свежий пост его
 * направления — нередко вайшнавский термин без пояснения, непонятный тому,
 * кто на портале первый день. Главную видят все, поэтому афоризм здесь должен
 * читаться без подготовки, и лучше всего для этого подходит «Философия».
 *
 * Берём её вперемешку: так афоризм меняется от захода к заходу, а не стоит
 * одним и тем же, пока в папку не добавят новый.
 */

/** Название папки, из которой карточка берёт афоризмы. */
export const WIDGET_CATEGORY_TITLE = "Философия";

/**
 * Слаг папки по названию, а не зашитый строкой: слаги у категорий заводит
 * админка, и на проде он может оказаться не тем, что получился бы из
 * транслитерации. Нет такой папки — `null`.
 */
export function widgetCategorySlug(
  categories: readonly MotivationCategoryDto[] | null | undefined,
): string | null {
  const wanted = WIDGET_CATEGORY_TITLE.toLocaleLowerCase("ru");
  const found = (categories ?? []).find(
    (category) => category.title.trim().toLocaleLowerCase("ru") === wanted,
  );
  return found?.slug ?? null;
}

export interface WidgetFeedSources {
  categories: () => Promise<MotivationCategoryDto[] | null>;
  /** Лента папки вперемешку; без слага — личная лента, как раньше. */
  feed: (category?: string) => Promise<MotivationFeedResponse | null>;
}

/**
 * Лента для карточки. Если «Философии» нет или в ней не нашлось ни одного
 * афоризма с текстом (одни открытки с цитатой на картинке), откатываемся к
 * личной ленте: пустая карточка хуже, чем не тот афоризм.
 */
export async function loadWidgetFeed(
  sources: WidgetFeedSources,
): Promise<MotivationFeedResponse | null> {
  const slug = widgetCategorySlug(
    await sources.categories().catch(() => null),
  );
  if (slug) {
    const philosophy = await sources.feed(slug).catch(() => null);
    if (buildMotivationQuickAccess(philosophy).quote) return philosophy;
  }
  return sources.feed().catch(() => null);
}
