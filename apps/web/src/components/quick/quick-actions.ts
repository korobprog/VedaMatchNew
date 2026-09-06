/**
 * Панель горячих кнопок: что в ней бывает и как её настраивают.
 *
 * Кнопка сюда попадает, только если ей есть что делать сегодня. Панель — это
 * короткий путь к тому, что уже работает, а не витрина обещаний: кнопка,
 * ведущая в пустоту, отнимает у панели ровно то, ради чего её открывают.
 *
 * Набор и порядок хранятся на устройстве. Это раскладка интерфейса, а не
 * данные человека: она разная на телефоне и на рабочем компьютере, и
 * тащить её на сервер значит спорить с этим. Тем же способом помнят своё
 * плотность сетки в Знакомствах и порядок рубрик в Образовании.
 */

export type QuickActionId =
  | "aphorism"
  | "collections"
  | "calendar"
  | "calculator"
  | "invite"
  | "donate"
  | "info"
  | "support";

export interface QuickActionMeta {
  id: QuickActionId;
  label: string;
  /** Чем кнопка полезна — строкой в настройках панели. */
  hint: string;
  /** Куда ведёт. `null` — открывает своё окно, а не страницу. */
  href: string | null;
}

export const QUICK_ACTIONS: readonly QuickActionMeta[] = [
  {
    id: "aphorism",
    label: "Афоризм",
    hint: "Открывает Вдохновение вперемешку — случайная цитата вместо ленты по порядку",
    href: "/motivation?order=random",
  },
  {
    id: "collections",
    label: "Подборки",
    hint: "Цитаты по разделам: Веды, вайшнавизм, философия",
    href: "/motivation/collections",
  },
  {
    id: "calendar",
    label: "Календарь",
    hint: "Афиша портала и вайшнавский календарь",
    // Своей страницы нет: календарей два, и выбор между ними — это
    // маленькая шторка, а не переход.
    href: null,
  },
  {
    id: "calculator",
    label: "Калькулятор",
    hint: "Считает прямо здесь, не уводя со страницы",
    href: null,
  },
  {
    id: "invite",
    label: "Пригласить",
    hint: "Копирует вашу ссылку-приглашение в буфер",
    href: null,
  },
  {
    id: "donate",
    label: "Поддержать",
    hint: "Реквизиты для помощи порталу",
    href: null,
  },
  {
    id: "info",
    label: "Что нужно знать",
    hint: "Коротко о портале и куда смотреть дальше",
    href: null,
  },
  {
    id: "support",
    label: "Написать админам",
    hint: "Вопрос, новость или сообщение о поломке",
    href: "/support",
  },
];

const KNOWN = new Set<string>(QUICK_ACTIONS.map((action) => action.id));

/**
 * Что стоит в панели у человека, который ничего не настраивал.
 *
 * Пять, а не все восемь: панель на телефоне помещается в два ряда, а
 * заполненная до краёв с первого открытия она не читается как настраиваемая
 * — её начинают разбирать, а не собирать.
 */
export const DEFAULT_QUICK_ACTIONS: readonly QuickActionId[] = [
  "aphorism",
  "calendar",
  "invite",
  "donate",
  "support",
];

/**
 * Разбор сохранённого набора. Всё непонятное — молча мимо: в хранилище
 * лежит набор с прошлой версии портала, где кнопка могла называться иначе
 * или не существовать вовсе, и падать на этом панели незачем.
 */
export function parseQuickConfig(raw: string | null): QuickActionId[] {
  if (!raw) return [...DEFAULT_QUICK_ACTIONS];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_QUICK_ACTIONS];
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_QUICK_ACTIONS];
  const kept = parsed.filter(
    (item): item is QuickActionId => typeof item === "string" && KNOWN.has(item),
  );
  // Дубли убираем: панель с двумя одинаковыми кнопками — это сбой хранилища,
  // а не выбор человека.
  return [...new Set(kept)];
}

export function serializeQuickConfig(ids: readonly QuickActionId[]): string {
  return JSON.stringify(ids);
}

/** Включить или выключить кнопку. Включённая встаёт в конец — туда, куда её и кладут. */
export function toggleQuickAction(
  ids: readonly QuickActionId[],
  id: QuickActionId,
): QuickActionId[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/**
 * Сдвинуть кнопку на шаг. Кнопками, а не перетаскиванием: панель открывают
 * с телефона одной рукой, и жест на восьми строках промахивается чаще, чем
 * попадает.
 */
export function moveQuickAction(
  ids: readonly QuickActionId[],
  id: QuickActionId,
  delta: -1 | 1,
): QuickActionId[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at === -1 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function quickActionMeta(id: QuickActionId): QuickActionMeta {
  return QUICK_ACTIONS.find((action) => action.id === id)!;
}
