/**
 * Две редакции — нейро-афоризмы и открытки (VED-299).
 *
 * «Когда открываешь для правки афоризм из Ленты — в редакторском меню были
 * видны только афоризмы, нарисованные нейросетью, а открытки не было видно.
 * И то же самое для открыток. То есть два раздельных меню редакции».
 *
 * Разделяет тот же признак, что и вкладки ленты (VED-121): `captionInImage`
 * — готовая открытка с напечатанным текстом, всё остальное — картинка
 * нейросети (или фото) с цитатой поверх. Кнопка «Править» в ленте передаёт
 * вид карточки адресом, и «Опубликованные» открываются уже суженными.
 */

export type PostKind = "art" | "cards";

export function parsePostKind(
  value: string | string[] | undefined,
): PostKind | undefined {
  return value === "art" || value === "cards" ? value : undefined;
}

export function postKindOf(post: { captionInImage: boolean }): PostKind {
  return post.captionInImage ? "cards" : "art";
}

/** Карточки одного вида; без вида — все, как раньше. */
export function filterByKind<T extends { captionInImage: boolean }>(
  posts: readonly T[],
  kind: PostKind | undefined,
): T[] {
  return kind ? posts.filter((post) => postKindOf(post) === kind) : [...posts];
}

/** Подписи переключателя: как вкладки ленты называет человек. */
export const POST_KIND_LABELS: Record<PostKind | "all", string> = {
  art: "Нейро-афоризмы",
  cards: "Открытки",
  all: "Все",
};

/** Адрес списка того же раздела редакции с другим видом. */
export function kindHref(basePath: string, kind: PostKind | undefined): string {
  return kind ? `${basePath}?kind=${kind}` : basePath;
}

/** «Править» из ленты: карточка открыта в редакции своего вида. */
export function editHref(post: {
  slug: string;
  captionInImage: boolean;
}): string {
  const query = new URLSearchParams({
    post: post.slug,
    kind: postKindOf(post),
  });
  return `/admin/motivation/published?${query}`;
}
