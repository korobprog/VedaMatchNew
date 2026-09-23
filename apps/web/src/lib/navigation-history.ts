/**
 * История перемещений по порталу (VED-392): что запомнить и как показать.
 *
 * Горячая кнопка «История» открывает список мест, где человек был, — по
 * сервисам и их ступеням, каждое место ссылкой назад. Здесь только правила:
 * какой переход записывать, как не раздуть список и как сложить подряд
 * идущие ступени одного сервиса в одну строку. Хранилище и отрисовка — в
 * `components/quick/`.
 *
 * Названия мест здесь не сочиняются: их даёт `portalLocation` из
 * `portal-location.ts` — те же, что на кнопке окна и у закладок. Правка
 * названия сервиса в каталоге обязана доезжать и сюда.
 */

import type { PortalLocation } from "./portal-location";

/** Одно посещение: адрес без якоря и когда на нём оказались. */
export interface NavigationHistoryEntry {
  url: string;
  at: number;
}

/**
 * Сколько посещений держим. Пятьдесят — это несколько дней обычной жизни на
 * портале и всё ещё меньше пяти килобайт в хранилище; старше — ищут уже не
 * по истории, а поиском.
 */
export const NAVIGATION_HISTORY_LIMIT = 50;

/**
 * Страницы, которые историей не являются: вход и заглушка офлайна —
 * промежуточные экраны, возвращаться на них по ссылке незачем.
 */
const SKIPPED_ROOTS = new Set(["login", "offline", "auth"]);

/** Адрес без якоря; `null` — не внутренний путь портала. */
export function normalizeHistoryUrl(url: string): string | null {
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  const clean = url.split("#")[0] ?? "";
  const root = clean.split(/[?/]/)[1] ?? "";
  return SKIPPED_ROOTS.has(root) ? null : clean;
}

function pathOf(url: string): string {
  return url.split("?")[0] ?? url;
}

/**
 * Дописать посещение в начало списка (новые — первыми).
 *
 * Правило query-параметров: переход, который меняет только query (вкладка,
 * фильтр, строка поиска, `?order=random`), не новое место, а та же страница.
 * Он ОБНОВЛЯЕТ последнюю запись — адрес и время, — а не добавляет новую:
 * иначе поиск, пишущий `?q=` на каждую букву, выдавил бы из истории всё
 * остальное за одно слово. Перезагрузка той же страницы — частный случай
 * того же правила и повтора не даёт.
 */
export function recordNavigationVisit(
  entries: readonly NavigationHistoryEntry[],
  url: string,
  at: number,
  limit: number = NAVIGATION_HISTORY_LIMIT,
): NavigationHistoryEntry[] {
  const clean = normalizeHistoryUrl(url);
  if (clean === null) return [...entries];
  const last = entries[0];
  if (last && pathOf(last.url) === pathOf(clean)) {
    return [{ url: clean, at }, ...entries.slice(1)];
  }
  return [{ url: clean, at }, ...entries].slice(0, Math.max(0, limit));
}

/**
 * Разбор сохранённой истории. Всё непонятное — молча мимо: чужая запись или
 * запись прошлой версии не должна ронять панель.
 */
export function parseNavigationHistory(
  raw: string | null,
  limit: number = NAVIGATION_HISTORY_LIMIT,
): NavigationHistoryEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (parsed as { v?: unknown; items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  const kept: NavigationHistoryEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { url, at } = item as { url?: unknown; at?: unknown };
    if (typeof url !== "string" || typeof at !== "number") continue;
    const clean = normalizeHistoryUrl(url);
    if (clean === null) continue;
    kept.push({ url: clean, at });
    if (kept.length >= limit) break;
  }
  return kept;
}

export function serializeNavigationHistory(
  entries: readonly NavigationHistoryEntry[],
): string {
  return JSON.stringify({ v: 1, items: entries });
}

/** Ступень внутри сервиса — одно звено строки. */
export interface NavigationHistoryStep {
  label: string;
  url: string;
}

/**
 * Строка истории: сервис (или раздел портала) и ступени, по которым в нём
 * прошли подряд.
 */
export interface NavigationHistoryGroup {
  /** Первый сегмент пути; одинаковый у всех посещений строки. */
  key: string;
  /** Название сервиса — один раз на строку, как просил заказчик. */
  root: string;
  /**
   * Куда ведёт название сервиса: последнее посещение самого сервиса в этой
   * строке, а если в сам сервис не заходили — его корень.
   */
  rootUrl: string;
  /** Ступени в порядке прохождения: слева направо, как путь. */
  steps: NavigationHistoryStep[];
  /** Время последнего посещения в строке. */
  at: number;
}

function groupKey(url: string): string {
  return pathOf(url).split("/")[1] ?? "";
}

/**
 * Сложить посещения в строки (VED-392).
 *
 * «Если происходит перемещение по нескольким разделам ступенями одного
 * сервиса к ряду, то название сервиса должно быть указано один раз в самом
 * начале». Поэтому строка — это непрерывный отрезок посещений одного
 * сервиса. Ушли в другой сервис и вернулись — это уже новая строка: история
 * рассказывает, как человек ходил, а не сколько раз где бывал.
 *
 * Строки идут от новых к старым, а ступени внутри строки — от старых к
 * новым: строка читается как путь «Работа · Доска · Повестка».
 *
 * Две подряд одинаково названные ступени (два товара, две записи) сливаются
 * в одну, ссылкой на более позднюю: «Товар · Товар · Товар» ничего не
 * говорит, а ведёт каждая всё равно на страницу того же вида.
 *
 * Посещение без опознанной ступени — это сам сервис (или страница, у
 * которой второй сегмент — идентификатор): оно звеном не становится, а
 * становится адресом названия сервиса.
 */
export function groupNavigationHistory(
  entries: readonly NavigationHistoryEntry[],
  locate: (url: string) => PortalLocation,
): NavigationHistoryGroup[] {
  const groups: NavigationHistoryGroup[] = [];
  // Идём от старых к новым: так ступени сразу ложатся в порядке пути.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const key = groupKey(entry.url);
    const place = locate(entry.url);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        root: place.root,
        rootUrl: `/${key}`,
        steps: [],
        at: entry.at,
      };
      groups.push(group);
    }
    group.at = entry.at;
    // Имя сервиса — по последнему посещению: каталог мог его поправить.
    group.root = place.root;
    if (!place.step) {
      group.rootUrl = entry.url;
      continue;
    }
    const previous = group.steps[group.steps.length - 1];
    if (previous && previous.label === place.step) {
      previous.url = entry.url;
    } else {
      group.steps.push({ label: place.step, url: entry.url });
    }
  }
  return groups.reverse();
}
