/**
 * Вид папки «Вдохновения».
 *
 * Сначала видов было два — иллюстрации и «готовые афоризмы». Оказалось, что
 * просили не это: под готовым афоризмом имелся в виду тот, что наложен на
 * фотографию человеком, а не картинка, нарисованная нейросетью. В одной куче
 * они неразличимы, и папка отвечала не на тот вопрос.
 *
 * Поэтому видов три, и оформленные афоризмы разведены по происхождению
 * картинки (`MotivationImageSource`): `uploaded` — фотография, которую принёс
 * человек, `generated` — работа нейросети.
 *
 * Вид живёт в адресе: из плитки уходят в ленту и возвращаются кнопкой
 * «назад», а состояние, которого нет в ссылке, при этом теряется молча.
 */

export type CollectionView = "image" | "photo" | "ai";

export interface CollectionViewOption {
  id: CollectionView;
  label: string;
}

/** Порядок вкладок: сначала «про что это», потом «что можно переслать». */
export const COLLECTION_VIEWS: CollectionViewOption[] = [
  { id: "image", label: "Иллюстрации" },
  { id: "photo", label: "На фотографиях" },
  { id: "ai", label: "Нейросеть" },
];

/**
 * `story` — вид из первой версии, когда оформленные афоризмы не делились по
 * происхождению картинки. Старые ссылки ведут туда, ради чего вид и заводили:
 * к афоризмам на фотографиях.
 */
export function parseCollectionView(
  raw: string | string[] | undefined,
): CollectionView {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (value === "photo" || value === "story") return "photo";
  if (value === "ai") return "ai";
  return "image";
}

export function collectionViewHref(slug: string, view: CollectionView): string {
  const base = `/motivation/collections/${encodeURIComponent(slug)}`;
  // Умолчание в адресе не пишем: чистая ссылка на папку и есть её первый вид.
  return view === "image" ? base : `${base}?view=${view}`;
}

/**
 * Чем фильтровать выдачу. `undefined` — иллюстрации показываем у всех постов
 * подряд, происхождение картинки там ни при чём.
 */
export function collectionImageSource(
  view: CollectionView,
): "uploaded" | "generated" | undefined {
  if (view === "photo") return "uploaded";
  if (view === "ai") return "generated";
  return undefined;
}

/** Оформленный афоризм показываем сторисными пропорциями, а не витринными. */
export function isStoryView(view: CollectionView): boolean {
  return view !== "image";
}

/**
 * Что написать, когда показывать нечего. Общее «в этом разделе пока пусто»
 * здесь врёт: в папке может быть полсотни афоризмов, просто ни одного нужного
 * вида.
 */
export function collectionEmptyText(view: CollectionView): string {
  if (view === "photo")
    return "Здесь афоризмы, наложенные на фотографии. В этой папке таких пока нет.";
  if (view === "ai")
    return "Здесь афоризмы на картинках, нарисованных нейросетью. В этой папке таких пока нет.";
  return "В этом разделе пока пусто.";
}
