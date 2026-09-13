/**
 * Панель смайликов в переписке (VED-122): вкладки как во всех мессенджерах,
 * «Недавние» и поиск по-русски. Здесь — всё, что не про разметку.
 */

export type EmojiRow = readonly [
  emoji: string,
  tab: number,
  label: string,
  extra?: string,
];

/** Вкладки в порядке мессенджеров. Номер совпадает со вторым полем строки. */
export const EMOJI_TABS = [
  { id: 0, label: "Смайлы и люди", icon: "😀" },
  { id: 1, label: "Животные и природа", icon: "🐻" },
  { id: 2, label: "Еда и напитки", icon: "🍎" },
  { id: 3, label: "Занятия", icon: "⚽" },
  { id: 4, label: "Путешествия", icon: "✈️" },
  { id: 5, label: "Предметы", icon: "💡" },
  { id: 6, label: "Символы", icon: "❤️" },
  { id: 7, label: "Флаги", icon: "🏳️" },
] as const;

export const RECENT_EMOJI_KEY = "vedamatch:chat-recent-emoji";

/** Сколько недавних держим: две строки панели. */
export const RECENT_EMOJI_MAX = 16;

/**
 * С чего начинаются «Недавние», пока человек ничего не выбирал, — прежний
 * быстрый ряд из чата Знакомств. Иначе первая вкладка была бы пустой.
 */
export const DEFAULT_RECENT_EMOJIS = [
  "😊",
  "🙏",
  "❤️",
  "😂",
  "👍",
  "🌸",
  "🕉️",
  "✨",
];

/** Строки по вкладкам: панель рисует их секциями подряд. */
export function groupEmojiRows(rows: readonly EmojiRow[]): EmojiRow[][] {
  const groups: EmojiRow[][] = EMOJI_TABS.map(() => []);
  for (const row of rows) groups[row[1]]?.push(row);
  return groups;
}

/**
 * Поиск: каждое слово запроса должно начинать какое-то слово названия или
 * тегов. «серд» находит сердца, «кот улыб» — улыбающегося кота, а «от» не
 * вытаскивает половину набора из-за «открытый» и «рот».
 */
export function searchEmojis(
  rows: readonly EmojiRow[],
  query: string,
): EmojiRow[] {
  const needles = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return [];
  return rows.filter(([, , label, extra]) => {
    const words = `${label} ${extra ?? ""}`.split(" ");
    return needles.every((needle) =>
      words.some((word) => word.startsWith(needle)),
    );
  });
}

/** Недавние с устройства. Мусор в хранилище — не повод падать. */
export function parseRecentEmojis(raw: string | null): string[] {
  if (!raw) return DEFAULT_RECENT_EMOJIS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return DEFAULT_RECENT_EMOJIS;
    const list = value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    return list.length ? list.slice(0, RECENT_EMOJI_MAX) : DEFAULT_RECENT_EMOJIS;
  } catch {
    return DEFAULT_RECENT_EMOJIS;
  }
}

/** Выбранный смайлик — первым в недавних, без повторов. */
export function withRecentEmoji(list: readonly string[], emoji: string): string[] {
  return [emoji, ...list.filter((item) => item !== emoji)].slice(
    0,
    RECENT_EMOJI_MAX,
  );
}

/**
 * Вставка туда, где стоит курсор, а не в конец: смайлик ставят и в середину
 * фразы. Выделенный текст заменяется, как при наборе с клавиатуры.
 */
export function insertAtCaret(
  text: string,
  emoji: string,
  start: number | null | undefined,
  end: number | null | undefined,
): { text: string; caret: number } {
  const from = clamp(start ?? text.length, text.length);
  const to = Math.max(from, clamp(end ?? from, text.length));
  return {
    text: `${text.slice(0, from)}${emoji}${text.slice(to)}`,
    caret: from + emoji.length,
  };
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}
