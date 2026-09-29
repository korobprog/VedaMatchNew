/**
 * Ряд кнопок под афоризмом: что в нём бывает и как он настраивается.
 *
 * Ряд один на всю ленту и делит ширину экрана поровну; не влезающие кнопки
 * уезжают в горизонтальную прокрутку (VED-243), но каждая лишняя всё равно
 * отодвигает остальные. Кому-то нужен «Озвучить» каждый день, кто-то
 * не пользуется им ни разу, а редакции важнее «Править» — угадать за всех
 * нельзя, поэтому набор и порядок выбирает человек.
 *
 * Раскладка хранится на устройстве: это привычка руки, а не данные человека.
 * Тем же способом помнят своё панель горячих кнопок портала и плотность
 * сетки в Знакомствах.
 */

export type RailActionId =
  | "like"
  | "save"
  | "share"
  | "hide"
  | "speak"
  | "edit"
  | "create"
  | "categories"
  | "random"
  | "settings";

export interface RailActionMeta {
  id: RailActionId;
  /** Как называется в настройках. Подпись под самой кнопкой короче. */
  label: string;
  /** Чем полезна — строкой в настройках. */
  hint: string;
  /**
   * Кнопка бывает не у каждого афоризма и не у каждого человека. Строка
   * объясняет это прямо в настройках: иначе включённая кнопка, которой не
   * видно в ленте, читается как поломка.
   */
  onlyWhen?: string;
}

export const RAIL_ACTIONS: readonly RailActionMeta[] = [
  {
    id: "like",
    label: "Нравится",
    hint: "Отметить афоризм и увидеть, скольким он отозвался",
  },
  {
    id: "save",
    label: "Сохранить",
    hint: "Отложить в «Избранное», чтобы вернуться",
  },
  {
    id: "share",
    label: "Поделиться",
    hint: "Экран отправки: в истории файлом, в переписку ссылкой, своим в портале",
  },
  {
    id: "hide",
    // Не «Скрыть текст»: так же подписана редакторская кнопка «Скрыть из
    // ленты», снимающая афоризм у всех читателей (VED-251). Эта убирает
    // цитату с картинки только у того, кто её нажал.
    label: "Без текста",
    hint: "Смотреть одно изображение — только у вас на экране",
    onlyWhen: "Только у фотографий: в ролике подпись вшита в кадр",
  },
  {
    id: "speak",
    label: "Озвучить",
    hint: "Читает голосом браузера",
    onlyWhen: "Только там, где в браузере есть синтез речи",
  },
  {
    id: "edit",
    label: "Править",
    hint: "Открыть публикацию в админке, не разыскивая её глазами",
    onlyWhen: "Только у администраторов",
  },
  {
    id: "create",
    label: "Создать",
    hint: "Свой афоризм: цитата, кадр и, если захотите, видео",
  },
  {
    id: "categories",
    label: "Категории",
    hint: "Папки ленты: Веды, вайшнавизм, философия",
  },
  {
    id: "random",
    label: "Случайный",
    hint: "Перемешать ленту и начать с неожиданного",
  },
  {
    id: "settings",
    label: "Настройки",
    hint: "Настройки ленты — язык, доля вайшнавского, этот же ряд",
  },
  // «Викторины» в ряду больше нет (VED-656): «вообще убери её оттуда и
  // помести в настройки». Вход — карточкой в настройках ленты и в меню ☰.
];

const KNOWN = new Set<string>(RAIL_ACTIONS.map((action) => action.id));

/**
 * Что стоит в ряду у того, кто ничего не настраивал: то, что стояло до
 * появления настройки. Новая кнопка встаёт последней, чтобы не переставлять
 * прежние под пальцем. «Викторина» (VED-243) из ряда ушла в настройки
 * (VED-656): сохранённые ряды теряют её молча — id больше не известен.
 */
export const DEFAULT_RAIL: readonly RailActionId[] = [
  "like",
  "save",
  "share",
  "hide",
  "speak",
  "edit",
  "create",
];

/**
 * Кнопки, которые существовали, когда раскладку хранили голым массивом, —
 * до «Викторины». Сохранённый тогда ряд про новую кнопку не знал: её там нет
 * не потому, что её убрали, а потому что её ещё не было.
 */
const LEGACY_KNOWN: readonly RailActionId[] = [
  "like",
  "save",
  "share",
  "hide",
  "speak",
  "edit",
  "create",
  "categories",
  "random",
  "settings",
];

function knownIds(raw: unknown): RailActionId[] {
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is RailActionId =>
          typeof item === "string" && KNOWN.has(item),
      )
    : [];
}

/**
 * Разбор сохранённой раскладки. Всё непонятное — молча мимо: в хранилище
 * лежит набор с прошлой версии портала, где кнопка могла называться иначе
 * или не существовать вовсе, и падать на этом ленте незачем.
 *
 * Рядом с рядом хранится, какие кнопки человек видел в настройке, когда его
 * сохранял (`known`). Кнопка из заводского ряда, которой тогда не было,
 * добавляется в конец — иначе новинку увидели бы только те, кто ни разу не
 * трогал настройку. Убранная после этого кнопка больше не возвращается.
 */
export function parseRailConfig(
  raw: string | null | undefined,
): RailActionId[] {
  if (!raw) return [...DEFAULT_RAIL];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_RAIL];
  }
  let ids: unknown;
  let known: readonly RailActionId[];
  if (Array.isArray(parsed)) {
    ids = parsed;
    known = LEGACY_KNOWN;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { ids?: unknown }).ids)
  ) {
    ids = (parsed as { ids: unknown }).ids;
    const saved = (parsed as { known?: unknown }).known;
    known = Array.isArray(saved) ? knownIds(saved) : LEGACY_KNOWN;
  } else {
    return [...DEFAULT_RAIL];
  }
  // Дубли убираем: две одинаковые кнопки в ряду — это сбой хранилища, а не
  // выбор человека. Пустой ряд оставляем пустым: убрать всё — тоже выбор.
  const kept = [...new Set(knownIds(ids))];
  const added = DEFAULT_RAIL.filter(
    (id) => !known.includes(id) && !kept.includes(id),
  );
  return [...kept, ...added];
}

export function serializeRailConfig(ids: readonly RailActionId[]): string {
  return JSON.stringify({
    ids,
    known: RAIL_ACTIONS.map((action) => action.id),
  });
}

/** Включить или выключить кнопку. Включённая встаёт в конец — туда, куда её и кладут. */
export function toggleRailAction(
  ids: readonly RailActionId[],
  id: RailActionId,
): RailActionId[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/**
 * Сдвинуть кнопку на шаг. Кнопками, а не перетаскиванием: настройку открывают
 * с телефона одной рукой, и жест на десяти строках промахивается чаще, чем
 * попадает.
 */
export function moveRailAction(
  ids: readonly RailActionId[],
  id: RailActionId,
  delta: -1 | 1,
): RailActionId[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at === -1 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function railActionMeta(id: RailActionId): RailActionMeta {
  return RAIL_ACTIONS.find((action) => action.id === id)!;
}

/** Ключ хранилища. Один на ленту и на её настройки. */
export const RAIL_STORAGE_KEY = "vedamatch:motivation-rail";
