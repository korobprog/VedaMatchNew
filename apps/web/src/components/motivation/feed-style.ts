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
}: {
  tab?: ReelsTab;
  order?: "random";
  category?: string;
  post?: string;
}): string {
  const query = new URLSearchParams();
  if (tab !== "forYou") query.set("tab", tab);
  // Избранное — одно на всех, папки у него нет.
  if (category && tab !== "saved") query.set("category", category);
  if (order) query.set("order", order);
  if (post) query.set("post", post);
  const suffix = query.toString();
  return `/motivation${suffix ? `?${suffix}` : ""}`;
}
