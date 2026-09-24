/**
 * Верхняя панель — ряд кнопок в шапке справа (VED-412, VED-434): что в нём
 * стоит и в каком порядке.
 *
 * По умолчанию — как было до VED-402: звёздочка горячих кнопок, колокольчик,
 * аватар и самой правой — «Меню». Колокольчик и аватар закреплены: это вход
 * в уведомления и в свой профиль, без них шапка не шапка. Всё остальное, в
 * том числе звёздочку и «Меню», можно убрать, переставить или заменить любой
 * горячей кнопкой — теми же, что в панели (`quick-actions.ts`): поиском,
 * историей, плеером, сервисом, своей кнопкой из закладки.
 *
 * Два ограничения, оба — чтобы человек не остался без выхода:
 *
 * - Из звёздочки и «Меню» остаётся хотя бы одна. Настройка верхней панели
 *   живёт в панели горячих кнопок и в настройке меню; убери обе — и вернуть
 *   их было бы нечем, а меню (с выходом из аккаунта, языком и темой)
 *   осталось бы только за жестом свайпа, у которого по WCAG 2.5.1 обязана
 *   быть кнопочная замена.
 * - Настраиваемых кнопок не больше четырёх. Шапка телефона шириной 320
 *   точек вмещает логотип, колокольчик, аватар и ровно четыре кнопки по 36
 *   точек с промежутками; пятая выталкивала бы ряд за край экрана.
 *
 * Хранится на устройстве, как панель и меню: шапка телефона и рабочего
 * компьютера у одного человека разная.
 */

import type { QuickActionId, QuickActionMeta } from "./quick-actions";

export const HEADER_TOOLBAR_STORAGE_KEY = "vedamatch:header-toolbar";

const HEADER_TOOLBAR_VERSION = 1;

/** Звёздочка: открывает панель горячих кнопок. */
export const HEADER_HOTKEYS_ID = "hotkeys";
export const HEADER_BELL_ID = "bell";
export const HEADER_AVATAR_ID = "avatar";

/** Закреплены: не убираются (VED-412). */
export const HEADER_FIXED_IDS: readonly QuickActionId[] = [
  HEADER_BELL_ID,
  HEADER_AVATAR_ID,
];

/** Из них в шапке остаётся хотя бы одна — см. комментарий к модулю. */
export const HEADER_ENTRY_IDS: readonly QuickActionId[] = [
  HEADER_HOTKEYS_ID,
  "menu",
];

/** Сколько кнопок, кроме колокольчика и аватара, помещается на экране 320. */
export const MAX_HEADER_BUTTONS = 4;

/** Шапка человека, который её не настраивал: как до VED-402. */
export const DEFAULT_HEADER_ITEMS: readonly QuickActionId[] = [
  HEADER_HOTKEYS_ID,
  HEADER_BELL_ID,
  HEADER_AVATAR_ID,
  "menu",
];

/** Строки настройки, которых нет в каталоге горячих кнопок. */
export const HEADER_OWN_ITEMS: readonly QuickActionMeta[] = [
  {
    id: HEADER_HOTKEYS_ID,
    kind: "builtin",
    label: "Горячие кнопки",
    hint: "Звёздочка: панель горячих кнопок и её настройка",
    href: null,
  },
  {
    id: HEADER_BELL_ID,
    kind: "builtin",
    label: "Уведомления",
    hint: "Колокольчик — всегда в шапке",
    href: null,
  },
  {
    id: HEADER_AVATAR_ID,
    kind: "builtin",
    label: "Профиль",
    hint: "Аватар — всегда в шапке",
    href: null,
  },
];

/** Всё, из чего собирают шапку: свои строки и каталог горячих кнопок. */
export function headerCatalog(
  quickCatalog: readonly QuickActionMeta[],
): QuickActionMeta[] {
  return [...HEADER_OWN_ITEMS, ...quickCatalog];
}

export function isHeaderFixed(id: QuickActionId): boolean {
  return HEADER_FIXED_IDS.includes(id);
}

/** Сколько настраиваемых кнопок стоит в шапке. */
export function headerButtonCount(ids: readonly QuickActionId[]): number {
  return ids.filter((id) => !isHeaderFixed(id)).length;
}

/**
 * Разбор записи. Всё непонятное — молча к умолчанию: сломанная запись не
 * должна оставить шапку без меню.
 */
export function parseHeaderToolbar(raw: string | null): QuickActionId[] {
  if (!raw) return [...DEFAULT_HEADER_ITEMS];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_HEADER_ITEMS];
  }
  const record = parsed as { v?: unknown; ids?: unknown } | null;
  if (
    !record ||
    typeof record !== "object" ||
    record.v !== HEADER_TOOLBAR_VERSION ||
    !Array.isArray(record.ids)
  )
    return [...DEFAULT_HEADER_ITEMS];
  return [
    ...new Set(
      record.ids.filter((id): id is string => typeof id === "string"),
    ),
  ];
}

export function serializeHeaderToolbar(ids: readonly QuickActionId[]): string {
  return JSON.stringify({ v: HEADER_TOOLBAR_VERSION, ids });
}

/**
 * Что рисовать в шапке и в каком порядке.
 *
 * - Кнопок, которых больше нет (сервис выключили, кнопку из закладки
 *   удалили), пропускаем.
 * - Колокольчик и аватар на месте всегда: пропавшие из записи встают в
 *   конец, перед «Меню», если оно там последнее.
 * - Без звёздочки и без «Меню» разом шапка не остаётся — звёздочка
 *   возвращается первой.
 * - Лишние сверх четырёх отбрасываются с конца.
 *
 * `known` — существующие горячие кнопки; свои строки шапки известны всегда.
 */
export function resolveHeaderToolbar(
  ids: readonly QuickActionId[],
  known: ReadonlySet<QuickActionId>,
): QuickActionId[] {
  const own = new Set(HEADER_OWN_ITEMS.map((meta) => meta.id));
  const kept: QuickActionId[] = [];
  let buttons = 0;
  for (const id of ids) {
    if (kept.includes(id)) continue;
    if (!own.has(id) && !known.has(id)) continue;
    if (!isHeaderFixed(id)) {
      if (buttons >= MAX_HEADER_BUTTONS) continue;
      buttons += 1;
    }
    kept.push(id);
  }
  const missingFixed = HEADER_FIXED_IDS.filter((id) => !kept.includes(id));
  if (missingFixed.length > 0) {
    const at = kept[kept.length - 1] === "menu" ? kept.length - 1 : kept.length;
    kept.splice(at, 0, ...missingFixed);
  }
  if (!HEADER_ENTRY_IDS.some((id) => kept.includes(id))) {
    if (buttons >= MAX_HEADER_BUTTONS) {
      let last = kept.length - 1;
      while (last >= 0 && isHeaderFixed(kept[last])) last -= 1;
      kept.splice(last, 1);
    }
    kept.unshift(HEADER_HOTKEYS_ID);
  }
  return kept;
}

/** Почему галочку у строки не снять или не поставить; `null` — можно. */
export type HeaderToggleBlock = "fixed" | "last-entry" | "full" | null;

export function headerToggleBlock(
  ids: readonly QuickActionId[],
  id: QuickActionId,
): HeaderToggleBlock {
  if (isHeaderFixed(id)) return "fixed";
  if (ids.includes(id)) {
    const entries = HEADER_ENTRY_IDS.filter((entry) => ids.includes(entry));
    return entries.length === 1 && entries[0] === id ? "last-entry" : null;
  }
  return headerButtonCount(ids) >= MAX_HEADER_BUTTONS ? "full" : null;
}

/** Подпись под строкой, объясняющая запрет. */
export function headerToggleNote(block: HeaderToggleBlock): string | null {
  switch (block) {
    case "fixed":
      return "Всегда в шапке";
    case "last-entry":
      return "Нужна звёздочка или «Меню» — хотя бы одна";
    case "full":
      return `В шапке уже ${MAX_HEADER_BUTTONS} кнопки — уберите одну`;
    default:
      return null;
  }
}

/**
 * Поставить или убрать кнопку. Новая встаёт левее колокольчика — рядом с
 * остальными кнопками, а не за аватаром, где её не ждут. Запрещённое
 * (`headerToggleBlock`) не делается.
 */
export function toggleHeaderItem(
  ids: readonly QuickActionId[],
  id: QuickActionId,
): QuickActionId[] {
  if (headerToggleBlock(ids, id) !== null) return [...ids];
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  const bell = ids.indexOf(HEADER_BELL_ID);
  const at = bell >= 0 ? bell : ids.length;
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

/**
 * Сдвинуть кнопку на шаг — стрелками, как в панели и меню. Колокольчик и
 * аватар сами не двигаются, но кнопку можно провести мимо них: так «Меню»
 * уходит из-за аватара в левую группу и обратно.
 */
export function moveHeaderItem(
  ids: readonly QuickActionId[],
  id: QuickActionId,
  delta: -1 | 1,
): QuickActionId[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at < 0 || isHeaderFixed(id) || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
