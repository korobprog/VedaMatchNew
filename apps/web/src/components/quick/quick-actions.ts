/**
 * Панель горячих кнопок: что в ней бывает и как её настраивают.
 *
 * Кнопка сюда попадает, только если ей есть что делать сегодня. Панель — это
 * короткий путь к тому, что уже работает, а не витрина обещаний: кнопка,
 * ведущая в пустоту, отнимает у панели ровно то, ради чего её открывают.
 *
 * Кнопки бывают трёх родов:
 *
 * - встроенные — своё поведение в коде панели (окно, калькулятор, донат);
 * - сервисные (`service:<слаг>`) — переход в сервис портала, список берётся
 *   из каталога (VED-326): держать под рукой «Работу» или «Музыку» хотят не
 *   меньше, чем поиск, а заводить руками двенадцать одинаковых записей
 *   значит гарантированно забыть тринадцатую;
 * - пользовательские (`custom:<путь>`) — кнопка, сделанная из закладки
 *   (VED-345). Закладок бывает много, а под рукой нужны две-три.
 *
 * Набор и порядок хранятся на устройстве. Это раскладка интерфейса, а не
 * данные человека: она разная на телефоне и на рабочем компьютере, и
 * тащить её на сервер значит спорить с этим. Тем же способом помнят своё
 * плотность сетки в Знакомствах и порядок рубрик в Образовании.
 */

import { SERVICE_CONTENT } from "@/lib/service-content";
import { VCALENDAR_URL } from "@/lib/vcalendar-button";

export type BuiltinQuickActionId =
  | "menu"
  | "window"
  | "bookmarks"
  | "history"
  | "player"
  | "radio"
  | "blog"
  | "app"
  | "search"
  | "assistant"
  | "aphorism"
  | "postcard"
  | "collections"
  | "calendar"
  | "calculator"
  | "invite"
  | "donate"
  | "info"
  | "support";

/**
 * Идентификатор кнопки — строка: сервисные и пользовательские кнопки
 * заводятся на ходу, и перечислением их не опишешь.
 */
export type QuickActionId = string;

export const SERVICE_ACTION_PREFIX = "service:";
export const CUSTOM_ACTION_PREFIX = "custom:";

export type QuickActionKind = "builtin" | "service" | "custom";

export interface QuickActionMeta {
  id: QuickActionId;
  kind: QuickActionKind;
  label: string;
  /** Чем кнопка полезна — строкой в настройках панели. */
  hint: string;
  /** Куда ведёт. `null` — открывает своё окно, а не страницу. */
  href: string | null;
}

export const BUILTIN_QUICK_ACTIONS: readonly QuickActionMeta[] = [
  {
    id: "menu",
    kind: "builtin",
    // VED-402: бывший бургер шапки. Место в шапке отдано «Истории», а меню
    // переехало сюда плиткой — тем же списком сервисов, языком, темой и
    // выходом, что и раньше.
    label: "Меню",
    hint: "Боковое меню: все сервисы, язык, тема, баллы и выход",
    href: null,
  },
  {
    id: "window",
    kind: "builtin",
    label: "Окно",
    hint: "Второе окно портала: свой адрес и своя история, первое остаётся где было",
    // Не переход, а переключение состояния: адрес зависит от того, где
    // второе окно оставили.
    href: null,
  },
  {
    id: "bookmarks",
    kind: "builtin",
    label: "Закладки",
    hint: "Отложенные страницы: исполнитель, доска, книга — любой уровень любого сервиса",
    href: null,
  },
  {
    id: "history",
    kind: "builtin",
    // VED-392: где человек уже был — по сервисам и их ступеням. Не
    // браузерная история: та знает адреса, а эта — места портала.
    label: "История",
    hint: "Где вы были: сервисы и их разделы по порядку — ссылкой назад",
    href: null,
  },
  {
    id: "player",
    kind: "builtin",
    // VED-416: плеер Музыки одной кнопкой — выкатывается свёрнутой полосой
    // и играет с того места, где остановились.
    label: "Плеер",
    hint: "Выкатывает плеер свёрнутым и включает звук с того места, где остановились",
    href: null,
  },
  {
    id: "radio",
    kind: "builtin",
    // VED-502, VED-534: радио Медиатеки одной кнопкой — включает и
    // выключает, не уводя со страницы, как кнопка «Радио» в самой Медиатеке.
    label: "Радио",
    hint: "Включает радио Медиатеки прямо здесь; второе нажатие выключает",
    href: null,
  },
  {
    id: "blog",
    kind: "builtin",
    // VED-506: лента постов — одной кнопкой.
    label: "Блог-лента",
    hint: "Лента постов портала: новое от авторов и из сервисов",
    href: "/blog",
  },
  {
    id: "app",
    kind: "builtin",
    // VED-448: скачать приложение VedaMatch — страница загрузки открыта и
    // гостю, поэтому кнопкой можно поделиться с кем угодно.
    label: "Приложение",
    hint: "Скачать приложение VedaMatch на телефон",
    href: "/app",
  },
  {
    id: "search",
    kind: "builtin",
    label: "Поиск",
    hint: "Поиск по VedaMatch: сразу по всем сервисам, которые умеют искать",
    href: "/search",
  },
  {
    id: "assistant",
    kind: "builtin",
    label: "Ассистент",
    hint: "Спросить ИИ-помощника: найдёт товар, цитату, материал, поможет с текстом",
    href: "/assistant",
  },
  {
    id: "aphorism",
    kind: "builtin",
    label: "Афоризм",
    hint: "Открывает Вдохновение вперемешку — случайная цитата вместо ленты по порядку",
    href: "/motivation?order=random",
  },
  {
    id: "postcard",
    kind: "builtin",
    // VED-326: та же кнопка, что «Афоризм», но для второй ленты Вдохновения.
    // Открытка — это цитата, УЖЕ напечатанная на картинке: её пересылают
    // целиком, а афоризм читают. Два разных повода зайти, и оба случайные.
    label: "Открытка",
    hint: "Открывает «Открытки» вперемешку — случайная цитата, напечатанная на картинке",
    href: "/motivation?tab=cards&order=random",
  },
  {
    id: "collections",
    kind: "builtin",
    // VED-326: было «Категории» — слово ни о чём, да и значок повторял тот,
    // что открывает саму панель.
    label: "Картинки",
    hint: "Цитаты с картинками по разделам: Веды, вайшнавизм, философия",
    href: "/motivation/collections",
  },
  {
    id: "calendar",
    kind: "builtin",
    label: "Календарь",
    hint: "Вайшнавский календарь: экадаши, посты и дни явления — на vcalendar.ru",
    // VED-496: «по нажатию сразу открывался вайшнавский календарь… Пусть
    // эта кнопка будет чисто под вайшнавский календарь». Раньше открывалась
    // шторка с выбором между ним и афишей портала.
    href: VCALENDAR_URL,
  },
  {
    id: "calculator",
    kind: "builtin",
    label: "Калькулятор",
    hint: "Считает прямо здесь, не уводя со страницы",
    href: null,
  },
  {
    id: "invite",
    kind: "builtin",
    label: "Пригласить",
    hint: "Копирует вашу ссылку-приглашение в буфер",
    href: null,
  },
  {
    id: "donate",
    kind: "builtin",
    label: "Поддержать",
    hint: "Реквизиты для помощи порталу",
    href: null,
  },
  {
    id: "info",
    kind: "builtin",
    label: "Что нужно знать",
    hint: "Коротко о портале и куда смотреть дальше",
    href: null,
  },
  {
    id: "support",
    kind: "builtin",
    // VED-326: «Написать админам» в две строки не влезало на плитку.
    label: "Админ",
    hint: "Вопрос, новость или сообщение о поломке — администрации портала",
    href: "/support",
  },
];

/**
 * Кнопка ведёт на чужой сайт (VED-496, «Календарь»): открывается в новой
 * вкладке с `rel="noopener noreferrer"`, а не переходом внутри портала.
 */
export function isExternalQuickHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/** Прежнее имя списка: панель и тесты звали его так с VED-118. */
export const QUICK_ACTIONS = BUILTIN_QUICK_ACTIONS;

const BUILTIN_IDS = new Set<string>(
  BUILTIN_QUICK_ACTIONS.map((action) => action.id),
);

/**
 * Кнопки, приехавшие позже панели (VED-163).
 *
 * У человека, который однажды настроил панель, в хранилище лежит его набор,
 * и новая кнопка в списке по умолчанию до него не доедет никогда. Поэтому
 * старая запись (голый массив) один раз дополняется этими тремя, а новая
 * (`{v:2}` и дальше) принимается как есть: выключенная кнопка обязана
 * остаться выключенной, иначе настройка ничего не значит.
 */
const ADDED_QUICK_ACTIONS: readonly QuickActionId[] = [
  "window",
  "bookmarks",
  "search",
];

/**
 * Кнопка «Открытка» приехала в четвёртой версии записи (VED-326).
 *
 * Правило «выключенная кнопка остаётся выключенной» она не нарушает:
 * выключить её человек ещё не мог — до этой версии её не существовало. Раз
 * заказчик просил её добавить, она обязана доехать и до тех, у кого панель
 * давно настроена, иначе «добавил» означает «добавил новичкам».
 */
const QUICK_ACTIONS_ADDED_IN_V4: readonly QuickActionId[] = ["postcard"];

/**
 * «История» приехала в пятой версии (VED-392) — по тому же правилу, что и
 * «Открытка»: заказчик просил кнопку, а не пункт в настройках, и выключить
 * её раньше было нельзя.
 */
const QUICK_ACTIONS_ADDED_IN_V5: readonly QuickActionId[] = ["history"];

/**
 * «Плеер» приехал в шестой версии (VED-416) — по тому же правилу: заказчик
 * просил добавить кнопку в панель, а выключить её раньше было нельзя.
 */
const QUICK_ACTIONS_ADDED_IN_V6: readonly QuickActionId[] = ["player"];

/**
 * «Приложение» приехало в седьмой версии (VED-448) — по тому же правилу:
 * кнопку просили, чтобы по ней каждый мог скачать приложение.
 */
const QUICK_ACTIONS_ADDED_IN_V7: readonly QuickActionId[] = ["app"];

/**
 * «Радио» и «Блог-лента» приехали в восьмой версии (VED-502, VED-534,
 * VED-506) — по тому же правилу: кнопки просили добавить в панель.
 */
const QUICK_ACTIONS_ADDED_IN_V8: readonly QuickActionId[] = ["radio", "blog"];

/** Всё, что приехало после седьмой версии, — дописывается к старым записям. */
const ADDED_SINCE_V7: readonly QuickActionId[] = QUICK_ACTIONS_ADDED_IN_V8;
/** Всё, что приехало после шестой. */
const ADDED_SINCE_V6: readonly QuickActionId[] = [
  ...QUICK_ACTIONS_ADDED_IN_V7,
  ...ADDED_SINCE_V7,
];
/** Всё, что приехало после пятой. */
const ADDED_SINCE_V5: readonly QuickActionId[] = [
  ...QUICK_ACTIONS_ADDED_IN_V6,
  ...ADDED_SINCE_V6,
];
/** Всё, что приехало после четвёртой. */
const ADDED_SINCE_V4: readonly QuickActionId[] = [
  ...QUICK_ACTIONS_ADDED_IN_V5,
  ...ADDED_SINCE_V5,
];
/** Всё, что приехало после третьей. */
const ADDED_SINCE_V3: readonly QuickActionId[] = [
  ...QUICK_ACTIONS_ADDED_IN_V4,
  ...ADDED_SINCE_V4,
];

/**
 * Версия записи в хранилище. Третья добавила кнопки из закладок (VED-345),
 * четвёртая — «Открытку» (VED-326), пятая — «Историю» (VED-392), шестая —
 * «Плеер» (VED-416), седьмая — «Приложение» (VED-448), восьмая — «Радио» и
 * «Блог-лента» (VED-502, VED-506).
 */
const CONFIG_VERSION = 8;

/**
 * Три кнопки, которые стоят первыми и не выключаются (VED-326, п. 6).
 *
 * Заказчик обвёл их на скриншоте и назвал порядок: «Поиск», «Поддержать»,
 * «Пригласить». Это не «что держать под рукой» — это три вещи, которые
 * порталу нужны от каждого гостя: найти, помочь деньгами, позвать своих.
 * Человек, который случайно снял с них галочку, о них больше не вспомнит.
 *
 * У админов их не закрепляем: админ живёт в панели каждый день и набирает её
 * под свою работу, а «Поддержать» ему показывать незачем.
 */
export const PINNED_QUICK_ACTIONS: readonly QuickActionId[] = [
  "search",
  "donate",
  "invite",
];

const NOTHING_PINNED: readonly QuickActionId[] = [];

/**
 * Кнопки, которых в панели нет: только в верхней панели шапки (VED-434).
 *
 * «Меню» было плиткой панели (VED-402), но заказчик попросил: «добавь туда
 * ещё одну кнопку — Меню и убери её из горячих клавиш». Теперь меню
 * открывается кнопкой в заголовке панели, рядом с её настройками, — там она
 * есть всегда, и кнопочная замена свайпу от края (WCAG 2.5.1) не пропадает.
 * В каталоге «Меню» остаётся: из него собирается верхняя панель.
 */
export const HEADER_ONLY_QUICK_ACTIONS: readonly QuickActionId[] = ["menu"];

/** Что закреплено у этого человека. У админа — ничего. */
export function lockedQuickActions(admin: boolean): readonly QuickActionId[] {
  return admin ? NOTHING_PINNED : PINNED_QUICK_ACTIONS;
}

/**
 * Поставить закреплённые кнопки в начало в их порядке, добавив недостающие.
 *
 * Применяется и при чтении хранилища, и при каждом сохранении: закрепление,
 * которое переживает только загрузку страницы, — это не закрепление.
 */
export function pinQuickActions(
  ids: readonly QuickActionId[],
  locked: readonly QuickActionId[],
): QuickActionId[] {
  if (locked.length === 0) return [...ids];
  return [...locked, ...ids.filter((id) => !locked.includes(id))];
}

/**
 * Порядок панели, какой её рисуют: закреплённые первыми (`pinQuickActions`),
 * без кнопок, которые живут только в шапке (VED-434): «Меню» из старых
 * записей из панели уходит.
 */
export function arrangeQuickActions(
  ids: readonly QuickActionId[],
  locked: readonly QuickActionId[],
): QuickActionId[] {
  return pinQuickActions(ids, locked).filter(
    (id) => !HEADER_ONLY_QUICK_ACTIONS.includes(id),
  );
}

/** Каталог для настройки панели: без кнопок, которые живут только в шапке. */
export function panelQuickActionCatalog(
  catalog: readonly QuickActionMeta[],
): QuickActionMeta[] {
  return catalog.filter((meta) => !HEADER_ONLY_QUICK_ACTIONS.includes(meta.id));
}

/**
 * Что стоит в панели у человека, который ничего не настраивал.
 *
 * Не все пятнадцать: заполненная до краёв с первого открытия панель не
 * читается как настраиваемая — её начинают разбирать, а не собирать.
 * Первыми — закреплённые три (VED-326), за ними способы перемещаться по
 * порталу: окно, закладки (VED-163). Человек, который их не включил, просто
 * не узнает, что они есть.
 */
export const DEFAULT_QUICK_ACTIONS: readonly QuickActionId[] = [
  ...PINNED_QUICK_ACTIONS,
  "window",
  "bookmarks",
  "history",
  "player",
  "radio",
  "blog",
  "app",
  "assistant",
  "aphorism",
  "postcard",
  "calendar",
  "support",
];

/** Кнопка, сделанная из закладки: подпись и куда ведёт (VED-345). */
export interface QuickCustomAction {
  label: string;
  href: string;
}

export interface QuickConfig {
  ids: QuickActionId[];
  custom: QuickCustomAction[];
}

/**
 * Идентификатор выводится из адреса, а не выдаётся случайно: так одна и та
 * же страница не попадает в панель дважды, а «эта уже есть» проверяется без
 * похода в список.
 */
export function customQuickActionId(href: string): QuickActionId {
  return `${CUSTOM_ACTION_PREFIX}${href}`;
}

/** Слаг сервиса из идентификатора сервисной кнопки; `null` — кнопка другая. */
export function serviceActionSlug(id: QuickActionId): string | null {
  return id.startsWith(SERVICE_ACTION_PREFIX)
    ? id.slice(SERVICE_ACTION_PREFIX.length)
    : null;
}

/**
 * Кнопки-переходы во все сервисы портала (VED-326).
 *
 * `available` — слаги из каталога сервисов: выключенный или ещё не
 * запущенный сервис в выбор не попадает, кнопка в пустоту панели не нужна.
 * Каталога нет (API не ответил) — показываем все: пустой список выглядел бы
 * как поломка настроек.
 *
 * `name` — имя из каталога; правка названия в админке обязана доезжать и
 * сюда, поэтому имя из `service-content.ts` остаётся только запасным.
 */
export function serviceQuickActions(options?: {
  available?: ReadonlySet<string>;
  name?: (slug: string, fallback: string) => string;
}): QuickActionMeta[] {
  const { available, name } = options ?? {};
  return SERVICE_CONTENT.filter(
    (service) => !available || available.size === 0 || available.has(service.slug),
  ).map((service) => ({
    id: `${SERVICE_ACTION_PREFIX}${service.slug}`,
    kind: "service" as const,
    label: name ? name(service.slug, service.name) : service.name,
    hint: service.tagline,
    href: service.route,
  }));
}

/**
 * Короткая подпись своей кнопки из закладки (VED-484). Закладка берёт
 * заголовок страницы — «Доска — Планировщик», — и на плитке он ломался в две
 * строки и сдвигал значок. Заказчик: «не делай больше двухсложные названия
 * на горячих клавишах». Оставляем последнюю часть заголовка — название
 * раздела, без хвоста «VedaMatch». Полный заголовок остаётся в подсказке.
 */
export function shortQuickLabel(label: string): string {
  const parts = label
    .split(/\s+[—–-]\s+|\s*\|\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !/^vedamatch$/i.test(part));
  return parts.length > 0 ? parts[parts.length - 1] : label.trim();
}

export function customQuickActions(
  custom: readonly QuickCustomAction[],
): QuickActionMeta[] {
  return custom.map((action) => ({
    id: customQuickActionId(action.href),
    kind: "custom" as const,
    label: shortQuickLabel(action.label),
    hint: `Ваша кнопка из закладки «${action.label}»: ${action.href}`,
    href: action.href,
  }));
}

/** Всё, из чего человек выбирает: встроенные, сервисы, свои. */
export function quickActionCatalog(
  custom: readonly QuickCustomAction[] = [],
  services: readonly QuickActionMeta[] = serviceQuickActions(),
): QuickActionMeta[] {
  return [...BUILTIN_QUICK_ACTIONS, ...services, ...customQuickActions(custom)];
}

/**
 * Описание кнопки; `null` — такой кнопки больше нет. Панель обязана уметь
 * это пережить: в хранилище лежит набор с прошлой версии портала, а
 * сервисная кнопка исчезает вместе с выключенным сервисом.
 */
export function quickActionMeta(
  id: QuickActionId,
  catalog: readonly QuickActionMeta[] = quickActionCatalog(),
): QuickActionMeta | null {
  return catalog.find((action) => action.id === id) ?? null;
}

/**
 * Разбор сохранённого набора. Всё непонятное — молча мимо: в хранилище
 * лежит набор с прошлой версии портала, где кнопка могла называться иначе
 * или не существовать вовсе, и падать на этом панели незачем.
 */
export function parseQuickConfig(raw: string | null): QuickConfig {
  const fallback = (): QuickConfig => ({
    ids: [...DEFAULT_QUICK_ACTIONS],
    custom: [],
  });
  if (!raw) return fallback();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback();
  }

  // Запись новой версии: набор человека, каким он его оставил.
  if (!Array.isArray(parsed)) {
    const record = parsed as
      | { v?: unknown; ids?: unknown; custom?: unknown }
      | null;
    if (!record || !Array.isArray(record.ids)) return fallback();
    if (record.v === CONFIG_VERSION) {
      const custom = parseCustom(record.custom);
      return { ids: dedupe(record.ids, custom), custom };
    }
    // Седьмая, шестая, пятая, четвёртая и третья версии: всё то же, плюс
    // кнопки, которых тогда не было.
    if (
      record.v === 7 ||
      record.v === 6 ||
      record.v === 5 ||
      record.v === 4 ||
      record.v === 3
    ) {
      const custom = parseCustom(record.custom);
      const added =
        record.v === 7
          ? ADDED_SINCE_V7
          : record.v === 6
          ? ADDED_SINCE_V6
          : record.v === 5
            ? ADDED_SINCE_V5
            : record.v === 4
              ? ADDED_SINCE_V4
              : ADDED_SINCE_V3;
      return { ids: withAdded(dedupe(record.ids, custom), added), custom };
    }
    // Вторая версия: те же идентификаторы, своих кнопок ещё не было.
    if (record.v === 2)
      return {
        ids: withAdded(dedupe(record.ids, []), ADDED_SINCE_V3),
        custom: [],
      };
    return fallback();
  }

  // Запись первой версии: дополняем кнопками, появившимися после неё, и
  // ставим их первыми — иначе человек с настроенной панелью о них не узнает.
  const kept = dedupe(parsed, []);
  const missing = ADDED_QUICK_ACTIONS.filter((id) => !kept.includes(id));
  return {
    ids: withAdded([...missing, ...kept], ADDED_SINCE_V3),
    custom: [],
  };
}

/** Дописать в конец кнопки, которых в записи ещё не могло быть. */
function withAdded(
  ids: readonly QuickActionId[],
  added: readonly QuickActionId[],
): QuickActionId[] {
  return [...ids, ...added.filter((id) => !ids.includes(id))];
}

export function serializeQuickConfig(config: QuickConfig): string {
  return JSON.stringify({
    v: CONFIG_VERSION,
    ids: config.ids,
    custom: config.custom,
  });
}

function parseCustom(source: unknown): QuickCustomAction[] {
  if (!Array.isArray(source)) return [];
  const kept: QuickCustomAction[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const { label, href } = item as { label?: unknown; href?: unknown };
    // Только внутренние пути: в хранилище мог оказаться чужой адрес, а
    // кнопка панели — это переход внутри портала.
    if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//"))
      continue;
    if (typeof label !== "string" || !label.trim()) continue;
    if (kept.some((action) => action.href === href)) continue;
    kept.push({ label: label.trim().slice(0, 40), href });
  }
  return kept;
}

/**
 * Дубли убираем: панель с двумя одинаковыми кнопками — это сбой хранилища,
 * а не выбор человека. Незнакомое — молча мимо, но сервисные кнопки
 * пропускаем по виду идентификатора, а не по списку: каталог сервисов
 * приходит с сервера и на момент разбора ещё не известен.
 */
function dedupe(
  source: readonly unknown[],
  custom: readonly QuickCustomAction[],
): QuickActionId[] {
  const customIds = new Set(custom.map((action) => customQuickActionId(action.href)));
  return [
    ...new Set(
      source.filter(
        (item): item is QuickActionId =>
          typeof item === "string" &&
          (BUILTIN_IDS.has(item) ||
            isServiceId(item) ||
            customIds.has(item)),
      ),
    ),
  ];
}

function isServiceId(id: string): boolean {
  const slug = serviceActionSlug(id);
  return slug !== null && SERVICE_CONTENT.some((item) => item.slug === slug);
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
 *
 * `floor` — сколько первых мест заняты закреплёнными кнопками (VED-326):
 * ниже этой границы не спускается закреплённая и выше неё не поднимается
 * обычная. Иначе «вверх» у четвёртой кнопки выталкивал бы «Пригласить» с
 * его места, а закрепление значило бы только «включена».
 */
export function moveQuickAction(
  ids: readonly QuickActionId[],
  id: QuickActionId,
  delta: -1 | 1,
  floor = 0,
): QuickActionId[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at < floor || to < floor || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/**
 * Сделать кнопку из закладки (VED-345). Кнопка сразу встаёт в панель: её
 * заводят, чтобы ею пользоваться, а не чтобы потом искать в настройках.
 * Повторное добавление той же страницы только обновляет подпись — закладку
 * могли переименовать.
 */
export function addCustomQuickAction(
  config: QuickConfig,
  action: QuickCustomAction,
): QuickConfig {
  const label = action.label.trim().slice(0, 40) || action.href;
  const id = customQuickActionId(action.href);
  const custom = [
    ...config.custom.filter((item) => item.href !== action.href),
    { label, href: action.href },
  ];
  const ids = config.ids.includes(id) ? config.ids : [...config.ids, id];
  return { ids, custom };
}

/**
 * Убрать свою кнопку совсем (VED-345): и из панели, и из списка настроек.
 * Выключить её галочкой мало — выключенная кнопка остаётся в выборе
 * навсегда, а список из сорока чужих страниц перестаёт читаться.
 */
export function removeCustomQuickAction(
  config: QuickConfig,
  id: QuickActionId,
): QuickConfig {
  if (!id.startsWith(CUSTOM_ACTION_PREFIX)) return config;
  return {
    ids: config.ids.filter((item) => item !== id),
    custom: config.custom.filter(
      (action) => customQuickActionId(action.href) !== id,
    ),
  };
}
