/**
 * Настройка бокового меню (VED-408): какие сервисы в нём видны, какие горячие
 * кнопки в него добавлены и в каком порядке стоит то и другое.
 *
 * Меню и панель горячих кнопок — два разных места, но строки у них одного
 * рода: сервисная строка меню — это та же сервисная кнопка
 * (`service:<слаг>`), а добавленная горячая кнопка — та же, что в панели
 * (`search`, `bookmarks`, `custom:<путь>`). Поэтому идентификаторы общие, и
 * одну кнопку не приходится описывать дважды.
 *
 * Запись: `ids` — видимые строки в своём порядке, `hidden` — сервисы,
 * которые человек спрятал. Спрятанные хранятся отдельно, а не выводятся из
 * «чего нет в `ids`»: иначе сервис, запущенный после настройки, не появился
 * бы у человека никогда — его не было в `ids`, и он считался бы спрятанным.
 * Теперь новый сервис дописывается в конец сам, а спрятанный остаётся
 * спрятанным.
 *
 * Хранится на устройстве, как и раскладка панели (см. `quick-actions.ts`):
 * меню телефона и рабочего компьютера у одного человека разные.
 */

import { SERVICE_CONTENT } from "@/lib/service-content";
import {
  SERVICE_ACTION_PREFIX,
  moveQuickAction,
  serviceActionSlug,
  type QuickActionId,
  type QuickActionMeta,
} from "./quick-actions";

export const SIDE_MENU_STORAGE_KEY = "vedamatch:side-menu";

const SIDE_MENU_VERSION = 1;

export interface SideMenuConfig {
  /** Видимые строки по порядку: сервисы и добавленные горячие кнопки. */
  ids: QuickActionId[];
  /** Спрятанные сервисы. */
  hidden: QuickActionId[];
}

/** Строка сервиса — тот же идентификатор, что у сервисной горячей кнопки. */
export function sideMenuServiceId(slug: string): QuickActionId {
  return `${SERVICE_ACTION_PREFIX}${slug}`;
}

/** Все сервисы меню в порядке портала (`service-content.ts`). */
export const SIDE_MENU_SERVICES: readonly QuickActionId[] = SERVICE_CONTENT.map(
  (service) => sideMenuServiceId(service.slug),
);

export function isSideMenuService(id: QuickActionId): boolean {
  return serviceActionSlug(id) !== null;
}

/** Меню человека, который ничего не настраивал, — все сервисы по порядку. */
export function defaultSideMenu(
  services: readonly QuickActionId[] = SIDE_MENU_SERVICES,
): SideMenuConfig {
  return { ids: [...services], hidden: [] };
}

/**
 * Разбор записи. Всё непонятное — молча мимо, как у панели: сломанная
 * запись не должна оставить человека без меню, в нём выход из аккаунта.
 */
export function parseSideMenuConfig(raw: string | null): SideMenuConfig {
  if (!raw) return defaultSideMenu();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSideMenu();
  }
  const record = parsed as { v?: unknown; ids?: unknown; hidden?: unknown } | null;
  if (
    !record ||
    typeof record !== "object" ||
    record.v !== SIDE_MENU_VERSION ||
    !Array.isArray(record.ids)
  )
    return defaultSideMenu();
  const ids = strings(record.ids);
  const hidden = strings(Array.isArray(record.hidden) ? record.hidden : []).filter(
    (id) => isSideMenuService(id) && !ids.includes(id),
  );
  return { ids, hidden };
}

export function serializeSideMenuConfig(config: SideMenuConfig): string {
  return JSON.stringify({
    v: SIDE_MENU_VERSION,
    ids: config.ids,
    hidden: config.hidden,
  });
}

/**
 * Что рисовать в меню и в каком порядке.
 *
 * - Строки, которых больше нет (сервис убрали из портала, кнопку из закладки
 *   удалили), пропускаются.
 * - Сервис, которого нет ни среди видимых, ни среди спрятанных, — новый: он
 *   встаёт в конец. Прятать то, чего человек ещё не видел, мы не вправе.
 *
 * `known` — все строки, которые сейчас существуют: сервисы и горячие кнопки.
 */
export function resolveSideMenu(
  config: SideMenuConfig,
  known: ReadonlySet<QuickActionId>,
  services: readonly QuickActionId[] = SIDE_MENU_SERVICES,
): QuickActionId[] {
  const seen = new Set<QuickActionId>();
  const visible: QuickActionId[] = [];
  for (const id of config.ids) {
    if (seen.has(id) || !known.has(id) || config.hidden.includes(id)) continue;
    seen.add(id);
    visible.push(id);
  }
  for (const id of services) {
    if (seen.has(id) || config.hidden.includes(id) || !known.has(id)) continue;
    seen.add(id);
    visible.push(id);
  }
  return visible;
}

/**
 * Показать или спрятать строку.
 *
 * Куда встаёт показанная строка (VED-429):
 *
 * - сервис — в самый верх, сразу под «Главную»: его возвращают, чтобы
 *   пользоваться, а в конце длинного списка, за горячими кнопками, его
 *   приходилось искать;
 * - горячая кнопка — в свою группу под сервисами, первой в ней, сразу за
 *   последним сервисом. Сервисы и кнопки остаются двумя группами, пока
 *   человек сам не перемешает их стрелками.
 *
 * Спрятанный сервис уходит в `hidden`; горячая кнопка просто убирается —
 * прятать её незачем, её в меню и не было, пока не добавили.
 *
 * `visible` — то, что сейчас нарисовано (`resolveSideMenu`): запись
 * пересобирается из него, чтобы в ней не копились исчезнувшие строки.
 */
export function toggleSideMenuItem(
  config: SideMenuConfig,
  visible: readonly QuickActionId[],
  id: QuickActionId,
): SideMenuConfig {
  const shown = visible.includes(id);
  if (isSideMenuService(id)) {
    return shown
      ? {
          ids: visible.filter((item) => item !== id),
          hidden: [...config.hidden.filter((item) => item !== id), id],
        }
      : {
          ids: [id, ...visible],
          hidden: config.hidden.filter((item) => item !== id),
        };
  }
  if (shown)
    return {
      ids: visible.filter((item) => item !== id),
      hidden: [...config.hidden],
    };
  return { ids: insertAfterServices(visible, id), hidden: [...config.hidden] };
}

/** Вставить горячую кнопку сразу за последним сервисом списка. */
function insertAfterServices(
  visible: readonly QuickActionId[],
  id: QuickActionId,
): QuickActionId[] {
  let at = 0;
  visible.forEach((item, index) => {
    if (isSideMenuService(item)) at = index + 1;
  });
  return [...visible.slice(0, at), id, ...visible.slice(at)];
}

/**
 * Сдвинуть строку на шаг — кнопками, как в панели горячих кнопок: жест на
 * длинном списке одной рукой промахивается чаще, чем попадает. Сервисы и
 * горячие кнопки стоят в одном списке и меняются местами друг с другом.
 */
export function moveSideMenuItem(
  config: SideMenuConfig,
  visible: readonly QuickActionId[],
  id: QuickActionId,
  delta: -1 | 1,
): SideMenuConfig {
  return { ids: moveQuickAction(visible, id, delta), hidden: [...config.hidden] };
}

/**
 * Какие горячие кнопки можно добавить в меню: все, кроме сервисных (сервисы
 * в меню и так есть — их прячут и показывают, а не добавляют) и самого
 * «Меню» — кнопка, открывающая меню изнутри меню, ничего бы не делала.
 */
export function sideMenuHotkeys(
  catalog: readonly QuickActionMeta[],
): QuickActionMeta[] {
  return catalog.filter((meta) => meta.kind !== "service" && meta.id !== "menu");
}

function strings(source: readonly unknown[]): QuickActionId[] {
  return [
    ...new Set(source.filter((item): item is string => typeof item === "string")),
  ];
}
