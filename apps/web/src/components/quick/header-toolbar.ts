/**
 * Верхняя панель — ряд кнопок в шапке справа (VED-412, VED-434): что в нём
 * стоит и в каком порядке.
 *
 * По умолчанию — как было до VED-402: звёздочка горячих кнопок, колокольчик,
 * аватар и самой правой — «Меню». Звёздочка, колокольчик и аватар
 * закреплены: звёздочка — вход в горячие кнопки и в настройку самой шапки
 * («Пусть звёздочка остаётся всегда, а меню нет», VED-412), колокольчик и
 * аватар — в уведомления и свой профиль. Всё остальное, в том числе «Меню»,
 * можно убрать, переставить или заменить любой горячей кнопкой — теми же,
 * что в панели (`quick-actions.ts`): поиском, историей, плеером, сервисом,
 * своей кнопкой из закладки.
 *
 * Аватар с VED-480 можно убрать: «сделай возможность прятать профиль в
 * боковое меню». Убранный, он стоит в боковом меню рядом с «Главной». В
 * счёт трёх настраиваемых кнопок он не входит и не двигается — у него своё
 * место у правого края.
 *
 * «Меню» убирать можно, потому что звёздочка на месте всегда: в её панели
 * есть кнопка меню, и меню (с выходом из аккаунта, языком и темой) не
 * остаётся за одним жестом свайпа (WCAG 2.5.1).
 *
 * Настраиваемых кнопок не больше трёх. Шапка телефона шириной 320 точек
 * вмещает логотип, колокольчик, аватар и ровно четыре кнопки по 36 точек с
 * промежутками; одна из четырёх — звёздочка, пятая выталкивала бы ряд за
 * край экрана.
 *
 * Хранится на устройстве, как панель и меню: шапка телефона и рабочего
 * компьютера у одного человека разная.
 */

import type { QuickActionId, QuickActionMeta } from "./quick-actions";

export const HEADER_TOOLBAR_STORAGE_KEY = "vedamatch:header-toolbar";

/**
 * Вторая версия — с VED-480: в первой аватар убрать было нельзя, и запись
 * без него — старая, до закрепления. Такой возвращаем аватар; во второй
 * его отсутствие — выбор человека.
 */
const HEADER_TOOLBAR_VERSION = 2;

/** Звёздочка: открывает панель горячих кнопок. */
export const HEADER_HOTKEYS_ID = "hotkeys";
export const HEADER_BELL_ID = "bell";
export const HEADER_AVATAR_ID = "avatar";

/** Закреплены: не убираются и не двигаются (VED-412). */
export const HEADER_FIXED_IDS: readonly QuickActionId[] = [
  HEADER_HOTKEYS_ID,
  HEADER_BELL_ID,
];

/** Сколько кнопок, кроме закреплённых, помещается на экране 320. */
export const MAX_HEADER_BUTTONS = 3;

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
    hint: "Звёздочка — всегда в шапке: панель горячих кнопок и её настройка",
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
    hint: "Аватар; убранный — в боковом меню рядом с «Главной»",
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

/**
 * Своё место в ряду: закреплённые и аватар (VED-480) — его можно убрать,
 * но не двигать, и в счёт кнопок он не входит.
 */
export function hasOwnHeaderSlot(id: QuickActionId): boolean {
  return isHeaderFixed(id) || id === HEADER_AVATAR_ID;
}

/** Аватар в шапке; нет — значит, он в боковом меню (VED-480). */
export function headerShowsAvatar(ids: readonly QuickActionId[]): boolean {
  return ids.includes(HEADER_AVATAR_ID);
}

/** Сколько настраиваемых кнопок стоит в шапке. */
export function headerButtonCount(ids: readonly QuickActionId[]): number {
  return ids.filter((id) => !hasOwnHeaderSlot(id)).length;
}

/** Вставить в конец ряда, но перед «Меню», если оно там последнее. */
function beforeTrailingMenu(
  ids: readonly QuickActionId[],
  items: readonly QuickActionId[],
): QuickActionId[] {
  const at = ids[ids.length - 1] === "menu" ? ids.length - 1 : ids.length;
  return [...ids.slice(0, at), ...items, ...ids.slice(at)];
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
    (record.v !== HEADER_TOOLBAR_VERSION && record.v !== 1) ||
    !Array.isArray(record.ids)
  )
    return [...DEFAULT_HEADER_ITEMS];
  const ids = [
    ...new Set(
      record.ids.filter((id): id is string => typeof id === "string"),
    ),
  ];
  // Первая версия: аватар тогда был закреплён — возвращаем его на место.
  if (record.v === 1 && !ids.includes(HEADER_AVATAR_ID))
    return beforeTrailingMenu(ids, [HEADER_AVATAR_ID]);
  return ids;
}

export function serializeHeaderToolbar(ids: readonly QuickActionId[]): string {
  return JSON.stringify({ v: HEADER_TOOLBAR_VERSION, ids });
}

/**
 * Что рисовать в шапке и в каком порядке.
 *
 * - Кнопок, которых больше нет (сервис выключили, кнопку из закладки
 *   удалили), пропускаем.
 * - Звёздочка на месте всегда: пропавшая из записи (её раньше можно было
 *   убрать) возвращается первой.
 * - Колокольчик и аватар на месте всегда: пропавшие из записи встают в
 *   конец, перед «Меню», если оно там последнее.
 * - Лишние сверх трёх настраиваемых отбрасываются с конца.
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
    if (!hasOwnHeaderSlot(id)) {
      if (buttons >= MAX_HEADER_BUTTONS) continue;
      buttons += 1;
    }
    kept.push(id);
  }
  const missingFixed = HEADER_FIXED_IDS.filter(
    (id) => id !== HEADER_HOTKEYS_ID && !kept.includes(id),
  );
  if (missingFixed.length > 0)
    kept.splice(0, kept.length, ...beforeTrailingMenu(kept, missingFixed));
  if (!kept.includes(HEADER_HOTKEYS_ID)) kept.unshift(HEADER_HOTKEYS_ID);
  return kept;
}

/** Почему галочку у строки не снять или не поставить; `null` — можно. */
export type HeaderToggleBlock = "fixed" | "full" | null;

export function headerToggleBlock(
  ids: readonly QuickActionId[],
  id: QuickActionId,
): HeaderToggleBlock {
  if (isHeaderFixed(id)) return "fixed";
  if (ids.includes(id) || id === HEADER_AVATAR_ID) return null;
  return headerButtonCount(ids) >= MAX_HEADER_BUTTONS ? "full" : null;
}

/** Подпись под строкой, объясняющая запрет. */
export function headerToggleNote(block: HeaderToggleBlock): string | null {
  switch (block) {
    case "fixed":
      return "Всегда в шапке";
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
  // Аватар возвращается на своё место — к правому краю (VED-480).
  if (id === HEADER_AVATAR_ID) return beforeTrailingMenu(ids, [id]);
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
  if (at < 0 || hasOwnHeaderSlot(id) || to < 0 || to >= ids.length)
    return [...ids];
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
