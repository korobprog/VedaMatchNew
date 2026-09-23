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
 * читаться без подготовки, и лучше всего для этого подходит папка
 * общечеловеческих афоризмов — была «Философия», теперь «Мудрость мира».
 *
 * Берём её вперемешку: так афоризм меняется от захода к заходу, а не стоит
 * одним и тем же, пока в папку не добавят новый.
 */

/**
 * Папка виджета — по слагу, а не по названию.
 *
 * Первая версия искала папку по названию «Философия», и переименование в
 * «Мудрость мира» (22.09) молча отправило карточку обратно в личную ленту.
 * Слаг при переименовании не меняется: админка правит только `title`
 * (`MotivationCategoriesService.update`), а `slug` выдаётся один раз при
 * создании. `filosofiya-2` — слаг этой папки на проде, сверено по базе
 * 23.09: «Мудрость мира», 28 публикаций.
 *
 * Названия — запасной путь, если папку удалят и заведут заново (слаг тогда
 * будет другим): нынешнее и прежнее. Нет ни слага, ни названий — личная
 * лента, как было до VED-79.
 */
export const WIDGET_CATEGORY = {
  slugs: ["filosofiya-2"],
  titles: ["Мудрость мира", "Философия"],
} as const;

/** Название без регистра, лишних пробелов и различия «е»/«ё». */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");
}

/**
 * Слаг папки для карточки. Сначала — по стабильному слагу, затем по
 * названиям в порядке `WIDGET_CATEGORY.titles`. Нет такой папки — `null`.
 */
export function widgetCategorySlug(
  categories: readonly MotivationCategoryDto[] | null | undefined,
): string | null {
  const list = categories ?? [];
  for (const slug of WIDGET_CATEGORY.slugs) {
    const found = list.find((category) => category.slug === slug);
    if (found) return found.slug;
  }
  for (const title of WIDGET_CATEGORY.titles) {
    const wanted = normalizeTitle(title);
    const found = list.find(
      (category) => normalizeTitle(category.title) === wanted,
    );
    if (found) return found.slug;
  }
  return null;
}

export interface WidgetFeedSources {
  categories: () => Promise<MotivationCategoryDto[] | null>;
  /** Лента папки вперемешку; без слага — личная лента, как раньше. */
  feed: (category?: string) => Promise<MotivationFeedResponse | null>;
}

export interface WidgetFeed {
  feed: MotivationFeedResponse | null;
  /**
   * Папка, из которой взят афоризм; `null` — личная лента. Нажатие на
   * цитату открывает её внутри этой же папки (VED-401: «дальнейшее
   * перелистывание должно быть в той ленте и в том разделе, к которым этот
   * афоризм принадлежит»).
   */
  category: string | null;
}

/**
 * Лента для карточки. Если папки нет или в ней не нашлось ни одного
 * афоризма с текстом (одни открытки с цитатой на картинке), откатываемся к
 * личной ленте: пустая карточка хуже, чем не тот афоризм.
 */
export async function loadWidgetFeed(
  sources: WidgetFeedSources,
): Promise<WidgetFeed> {
  const slug = widgetCategorySlug(
    await sources.categories().catch(() => null),
  );
  if (slug) {
    const wisdom = await sources.feed(slug).catch(() => null);
    if (buildMotivationQuickAccess(wisdom).quote)
      return { feed: wisdom, category: slug };
  }
  return { feed: await sources.feed().catch(() => null), category: null };
}
