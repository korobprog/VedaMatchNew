/**
 * Показывать ли блог-ленту на главной (VED-238).
 *
 * «Также сделай возможность убирать Ленту с экрана. В таком режиме, все
 * должно выглядеть по старому» — значит выбор обязан быть известен ещё на
 * сервере: лента рисуется в SSR, и решение, известное только браузеру, дало
 * бы главную, которая сначала показывает ленту, а потом её убирает.
 *
 * Поэтому cookie, как у трёх кнопок главной (`home-featured.ts`), и с тем же
 * приёмом: значение несёт `userId`, чтобы на общем устройстве второй человек
 * не получил чужую настройку.
 *
 * Чистый модуль: разбор и сборка cookie проверяются тестом.
 */
export const BLOG_HOME_COOKIE = "vm_blog_feed";
export const BLOG_HOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** По умолчанию лента показана: карточка задачи просит её именно наверху. */
export const BLOG_HOME_DEFAULT_VISIBLE = true;

const HIDDEN = "hidden";
const SHOWN = "shown";

/**
 * `null` — выбора нет (cookie пуста, испорчена или от другого человека), то
 * есть «как по умолчанию».
 */
export function parseBlogHomeVisible(
  raw: string | undefined,
  userId: string,
): boolean | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  if (value.slice(0, separator) !== userId) return null;
  const state = value.slice(separator + 1);
  if (state === HIDDEN) return false;
  if (state === SHOWN) return true;
  return null;
}

export function serializeBlogHomeVisible(
  userId: string,
  visible: boolean,
): string {
  return encodeURIComponent(`${userId}|${visible ? SHOWN : HIDDEN}`);
}

/** Итоговый ответ «рисовать ли ленту», с добором до значения по умолчанию. */
export function resolveBlogHomeVisible(
  raw: string | undefined,
  userId: string,
): boolean {
  const parsed = parseBlogHomeVisible(raw, userId);
  return parsed ?? BLOG_HOME_DEFAULT_VISIBLE;
}
