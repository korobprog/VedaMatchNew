import type {
  MotivationCategoryDto,
  MotivationCategoryFeed,
} from '@vedamatch/shared';

/**
 * Два меню категорий — у «Для вас» и у «Открыток» (VED-139).
 *
 * Лента давно разделена на два стиля (VED-121): `art` — иллюстрация
 * нейросети и цитата поверх, `cards` — готовая открытка с напечатанным
 * текстом. А меню категорий оставалось одним: у «Вед» стояло число всех
 * публикаций разом, и из «Открыток» человек шёл в папку, где открыток нет.
 *
 * Справочник остался один — у поста по-прежнему одно поле `category`, и
 * делить его на два значило бы переносить данные. Вместо этого у категории
 * есть лента (`feed`):
 *
 * - `art` / `cards` — категория стоит только в меню своей ленты, даже
 *   пустая: редакция завела её под эту ленту, и там её должны найти;
 * - `both` — общая (так помечены все категории, заведённые до разделения).
 *   Она стоит в меню той ленты, где в ней что-то есть. Совсем пустая общая
 *   видна в обоих: чья она — ещё не решено, а прятать заведённый раздел
 *   отовсюду значит потерять его.
 *
 * Счётчик в каждом меню — только своей ленты.
 *
 * Верхняя категория остаётся в меню, если в нём стоит хоть одна её
 * подкатегория: иначе подкатегории не к чему крепиться.
 */

export type FeedStyle = 'art' | 'cards';

/** Можно ли класть в категорию публикацию этой ленты. */
export function categoryAcceptsStyle(
  feed: MotivationCategoryFeed,
  style: FeedStyle,
): boolean {
  return feed === 'both' || feed === style;
}

/** Стоит ли категория в меню ленты сама по себе, без учёта подкатегорий. */
function ownVisible(
  category: MotivationCategoryDto,
  style: FeedStyle,
): boolean {
  if (category.feed === style) return true;
  if (category.feed !== 'both') return false;
  const own = style === 'cards' ? category.cardsCount : category.artCount;
  return own > 0 || category.artCount + category.cardsCount === 0;
}

/**
 * Меню категорий одной ленты. Вход — плоский список в порядке обхода дерева
 * (как отдаёт справочник), выход — в том же порядке, с `postCount` этой
 * ленты.
 */
export function categoriesForStyle(
  categories: readonly MotivationCategoryDto[],
  style: FeedStyle,
): MotivationCategoryDto[] {
  const ids = new Set(categories.map((category) => category.id));
  const visible = new Set(
    categories
      .filter((category) => ownVisible(category, style))
      .map((category) => category.id),
  );
  // Родитель подкатегории из этого меню тоже в меню.
  for (const category of categories) {
    if (
      visible.has(category.id) &&
      category.parentId &&
      ids.has(category.parentId)
    )
      visible.add(category.parentId);
  }
  return categories
    .filter((category) => visible.has(category.id))
    .map((category) => ({
      ...category,
      postCount: style === 'cards' ? category.cardsCount : category.artCount,
    }));
}
