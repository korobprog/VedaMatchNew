/**
 * Порядок кнопок под постом Блог-ленты (VED-509). Меняется кнопкой рядом
 * с «Поделиться» на странице поста и действует везде, где стоит карточка
 * поста: в ленте, у автора, на странице поста.
 *
 * Кнопки переставляются, но не прячутся. Кнопки, которых человеку не видно
 * (правка, закрепление, удаление — только своим и модераторам), в порядке
 * всё равно есть: у читателя они просто пропускаются.
 *
 * Порядок живёт на устройстве (`localStorage`), как порядок панели на
 * главной (`home-panel-order.ts`). Смена порядка оповещает все карточки на
 * странице событием, чтобы они перестроились сразу, без перезагрузки.
 */
export type PostAction =
  | "like"
  | "speak"
  | "copy"
  | "favorite"
  | "repost"
  | "edit"
  | "pin"
  | "delete";

export const POST_ACTIONS_DEFAULT_ORDER: readonly PostAction[] = [
  // «Нравится» (VED-505) — первой: заказчик поставил её сразу за «Далее».
  // У тех, кто уже менял порядок, она встанет в конец — порядок их.
  "like",
  "speak",
  "copy",
  "favorite",
  "repost",
  "edit",
  "pin",
  "delete",
];

export const POST_ACTION_LABELS: Record<PostAction, string> = {
  like: "Нравится",
  speak: "Слушать",
  copy: "Копировать",
  favorite: "Избранное",
  repost: "Репост",
  edit: "Изменить",
  pin: "Закрепить",
  delete: "Удалить",
};

export const POST_ACTIONS_ORDER_KEY = "blog:post-actions-order";

/** Событие смены порядка в этой вкладке; другие вкладки узнают по `storage`. */
export const POST_ACTIONS_ORDER_EVENT = "blog:post-actions-order";

/**
 * Сохранённый порядок → полный: незнакомое и повторы выбрасываются, кнопки,
 * появившиеся после сохранения, встают в конец в порядке по умолчанию.
 */
export function normalizePostActionsOrder(raw: unknown): PostAction[] {
  const known = new Set<string>(POST_ACTIONS_DEFAULT_ORDER);
  const seen = new Set<string>();
  const order: PostAction[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && known.has(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item as PostAction);
      }
    }
  }
  for (const item of POST_ACTIONS_DEFAULT_ORDER) {
    if (!seen.has(item)) order.push(item);
  }
  return order;
}

/** Строка из хранилища → порядок; битая строка — порядок по умолчанию. */
export function parsePostActionsOrder(raw: string | null): PostAction[] {
  if (!raw) return [...POST_ACTIONS_DEFAULT_ORDER];
  try {
    return normalizePostActionsOrder(JSON.parse(raw));
  } catch {
    return [...POST_ACTIONS_DEFAULT_ORDER];
  }
}

/** Сдвинуть кнопку на шаг; у края — без изменений. */
export function movePostAction(
  order: readonly PostAction[],
  id: PostAction,
  direction: -1 | 1,
): PostAction[] {
  const at = order.indexOf(id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function readPostActionsOrderRaw(): string | null {
  try {
    return window.localStorage.getItem(POST_ACTIONS_ORDER_KEY);
  } catch {
    return null;
  }
}

export function writePostActionsOrder(order: readonly PostAction[]): void {
  try {
    window.localStorage.setItem(POST_ACTIONS_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Не запомнили — порядок проживёт до перезагрузки.
  }
  window.dispatchEvent(new Event(POST_ACTIONS_ORDER_EVENT));
}

export function subscribePostActionsOrder(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === POST_ACTIONS_ORDER_KEY) onChange();
  };
  window.addEventListener(POST_ACTIONS_ORDER_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(POST_ACTIONS_ORDER_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
