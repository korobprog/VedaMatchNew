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
  | "window"
  | "bookmarks"
  | "search"
  | "assistant"
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
    id: "window",
    label: "Окно",
    hint: "Второе окно портала: свой адрес и своя история, первое остаётся где было",
    // Не переход, а переключение состояния: адрес зависит от того, где
    // второе окно оставили.
    href: null,
  },
  {
    id: "bookmarks",
    label: "Закладки",
    hint: "Отложенные страницы: исполнитель, доска, книга — любой уровень любого сервиса",
    href: null,
  },
  {
    id: "search",
    label: "Поиск",
    hint: "Поиск по VedaMatch: сразу по всем сервисам, которые умеют искать",
    href: "/search",
  },
  {
    id: "assistant",
    label: "Ассистент",
    hint: "Спросить ИИ-помощника: найдёт товар, цитату, материал, поможет с текстом",
    href: "/assistant",
  },
  {
    id: "aphorism",
    label: "Афоризм",
    hint: "Открывает Вдохновение вперемешку — случайная цитата вместо ленты по порядку",
    href: "/motivation?order=random",
  },
  {
    id: "collections",
    label: "Категории",
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
 * Кнопки, приехавшие позже панели (VED-163).
 *
 * У человека, который однажды настроил панель, в хранилище лежит его набор,
 * и новая кнопка в списке по умолчанию до него не доедет никогда. Поэтому
 * старая запись (голый массив) один раз дополняется этими тремя, а новая
 * (`{v:2}`) принимается как есть: выключенная кнопка обязана остаться
 * выключенной, иначе настройка ничего не значит.
 */
const ADDED_QUICK_ACTIONS: readonly QuickActionId[] = [
  "window",
  "bookmarks",
  "search",
];

/** Версия записи в хранилище. См. ADDED_QUICK_ACTIONS. */
const CONFIG_VERSION = 2;

/**
 * Что стоит в панели у человека, который ничего не настраивал.
 *
 * Не все двенадцать: заполненная до краёв с первого открытия панель не
 * читается как настраиваемая — её начинают разбирать, а не собирать.
 * Окно, закладки и поиск стоят первыми и включены всегда (VED-163): это не
 * «что держать под рукой», а три способа перемещаться по порталу, и человек,
 * который их не включил, просто не узнает, что они есть.
 */
export const DEFAULT_QUICK_ACTIONS: readonly QuickActionId[] = [
  ...ADDED_QUICK_ACTIONS,
  "assistant",
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

  // Запись новой версии: набор человека, каким он его оставил.
  if (!Array.isArray(parsed)) {
    const record = parsed as { v?: unknown; ids?: unknown } | null;
    if (!record || record.v !== CONFIG_VERSION || !Array.isArray(record.ids)) {
      return [...DEFAULT_QUICK_ACTIONS];
    }
    return dedupe(record.ids);
  }

  // Запись прошлой версии: дополняем кнопками, появившимися после неё, и
  // ставим их первыми — иначе человек с настроенной панелью о них не узнает.
  const kept = dedupe(parsed);
  const missing = ADDED_QUICK_ACTIONS.filter((id) => !kept.includes(id));
  return [...missing, ...kept];
}

export function serializeQuickConfig(ids: readonly QuickActionId[]): string {
  return JSON.stringify({ v: CONFIG_VERSION, ids });
}

/**
 * Дубли убираем: панель с двумя одинаковыми кнопками — это сбой хранилища,
 * а не выбор человека. Всё незнакомое — молча мимо: в хранилище лежит набор
 * с прошлой версии портала, где кнопка могла называться иначе.
 */
function dedupe(source: readonly unknown[]): QuickActionId[] {
  return [
    ...new Set(
      source.filter(
        (item): item is QuickActionId =>
          typeof item === "string" && KNOWN.has(item),
      ),
    ),
  ];
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
