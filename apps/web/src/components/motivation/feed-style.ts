/**
 * Две ленты Вдохновения (VED-121).
 *
 * Картинки нейросети с цитатой поверх и готовые открытки с напечатанным
 * текстом вместе не показывают: разный стиль на соседних свайпах читается
 * как сбой, а не как разнообразие. «Для вас» — первое, «Открытки» — второе.
 * Избранное остаётся одним списком: там человек сам решил, что сохранить.
 */

export type ReelsTab = "forYou" | "cards" | "saved";

/** `art` — нейросеть, ролики и фото с цитатой поверх; `cards` — открытки. */
export type FeedStyle = "art" | "cards";

export function parseReelsTab(value: string | undefined): ReelsTab {
  if (value === "saved" || value === "cards") return value;
  return "forYou";
}

/** Какую ленту просить у сервера. Избранное — без разделения. */
export function feedStyleOf(tab: ReelsTab): FeedStyle | undefined {
  if (tab === "cards") return "cards";
  if (tab === "forYou") return "art";
  return undefined;
}

/**
 * Чип категории у афоризма (VED-120): название и лента этой папки.
 *
 * Открытка ведёт в «Открытки» своей папки, остальное — в «Для вас»: чип не
 * должен из ленты одного стиля уводить в другой. `null` — показывать
 * нечего: без названия справочник категорию не знает, и слаг вроде `daily`
 * вместо слов читался бы как поломка.
 */
export function categoryLink(post: {
  category: string;
  categoryTitle: string;
  captionInImage: boolean;
}): { title: string; href: string } | null {
  // Старые ответы и кэш могут прийти без названия — не падаем, а молчим.
  const title = (post.categoryTitle ?? "").trim();
  if (!post.category || !title || title === post.category) return null;
  return {
    title,
    href: reelsHref({
      tab: post.captionInImage ? "cards" : "forYou",
      category: post.category,
    }),
  };
}

/**
 * Ссылка `?post=` без вкладки ведёт на открытку — ей место в «Открытках».
 * Такие ссылки дают мастер, «Мои», плитки папки и админка, и открытка,
 * открытая в «Для вас», тянула бы за собой ленту другого стиля.
 */
export function isPinnedCard(
  post: string | undefined,
  first: { slug: string; captionInImage: boolean } | undefined,
): boolean {
  return Boolean(post && first?.slug === post && first.captionInImage);
}

/**
 * Адрес ленты. Вкладка, порядок и папка едут вместе: переключив «Вперемешку»
 * в открытках, человек не должен молча оказаться в другой ленте.
 */
export function reelsHref({
  tab = "forYou",
  order,
  category,
  post,
  speaker,
  work,
}: {
  tab?: ReelsTab;
  order?: "random";
  category?: string;
  post?: string;
  /** Фильтр по автору (VED-206). */
  speaker?: string;
  /** Фильтр по источнику (VED-206). */
  work?: string;
}): string {
  const query = new URLSearchParams();
  if (tab !== "forYou") query.set("tab", tab);
  // Избранное — одно на всех, папки у него нет.
  if (category && tab !== "saved") query.set("category", category);
  // Фильтры — как папка: у избранного их нет.
  if (speaker?.trim() && tab !== "saved") query.set("speaker", speaker.trim());
  if (work?.trim() && tab !== "saved") query.set("work", work.trim());
  if (order) query.set("order", order);
  if (post) query.set("post", post);
  const suffix = query.toString();
  return `/motivation${suffix ? `?${suffix}` : ""}`;
}

/**
 * Кнопки категорий на пустом тёмном экране ленты (VED-135): «Вы посмотрели
 * всё новое» и «На сегодня это всё». Там человек как раз решает, что смотреть
 * дальше, а за категориями приходилось идти в меню.
 *
 * Все непустые папки любого уровня, в порядке дерева: верхняя, за ней её
 * подпапки. Сначала брали только верхние — а на проде верхняя одна, «Общая»,
 * и сама пустая: всё опубликованное лежит в подпапках, и кнопок не было вовсе.
 * Пустые не показываем: такая кнопка ведёт в ленту «пока пусто». Вкладка
 * сохраняется, как у чипа категории, — из «Открыток» в «Открытки». Избранное
 * без папок, поэтому из него кнопки ведут в «Для вас».
 */
export function feedCategoryButtons(
  categories: {
    id: string;
    slug: string;
    title: string;
    sortOrder: number;
    parentId: string | null;
    postCount: number;
  }[],
  {
    tab,
    order,
    current,
  }: { tab: ReelsTab; order?: "random"; current?: string },
): { slug: string; title: string; href: string; current: boolean }[] {
  const target: ReelsTab = tab === "saved" ? "forYou" : tab;
  const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) =>
    a.sortOrder - b.sortOrder;
  const ids = new Set(categories.map((category) => category.id));
  // Верхние — те, у кого родителя нет в списке: подпапка без родителя не
  // должна пропасть из кнопок только потому, что родитель не пришёл.
  const roots = categories
    .filter((category) => !category.parentId || !ids.has(category.parentId))
    .sort(bySort);
  const ordered = roots.flatMap((root) => [
    root,
    ...categories
      .filter((category) => category.parentId === root.id)
      .sort(bySort),
  ]);
  return ordered
    .filter((category) => category.postCount > 0)
    .map((category) => ({
      slug: category.slug,
      title: category.title,
      href: reelsHref({ tab: target, order, category: category.slug }),
      current: category.slug === current,
    }));
}
