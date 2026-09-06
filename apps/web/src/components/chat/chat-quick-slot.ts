/**
 * Быстрый слот у поля ввода: одна плитка из панели вложений, вынесенная
 * правее «+». По умолчанию — ассистент; закрепить другую можно булавкой на
 * плитке, долгим нажатием (телефон) или перетаскиванием на слот (мышь).
 *
 * Выбор хранится на устройстве, как раскладка панели горячих кнопок: это
 * привычка руки, а не данные человека, и на телефоне она может отличаться
 * от рабочего компьютера.
 */

export type ChatQuickSlotId =
  | "assistant"
  | "photo"
  | "file"
  | "emoji"
  | "story"
  | "notice"
  | "product"
  | "contact";

export const CHAT_QUICK_SLOT_IDS: readonly ChatQuickSlotId[] = [
  "assistant",
  "photo",
  "file",
  "emoji",
  "story",
  "notice",
  "product",
  "contact",
];

export const DEFAULT_CHAT_QUICK_SLOT: ChatQuickSlotId = "assistant";

export const CHAT_QUICK_SLOT_STORAGE_KEY = "vedamatch:chat-quick-slot";

/** Сколько держать плитку, чтобы это считалось «закрепить», а не «нажать». */
export const LONG_PRESS_MS = 500;

const KNOWN = new Set<string>(CHAT_QUICK_SLOT_IDS);

/**
 * Разбор сохранённого значения. Незнакомое — молча по умолчанию: в
 * хранилище может лежать плитка с прошлой версии чата, и падать на этом
 * полю ввода незачем. `assistant`, когда помощник выключен, тоже
 * откатывается к умолчанию выше по стеку — здесь про это не знают.
 */
export function parseQuickSlot(raw: string | null | undefined): ChatQuickSlotId {
  if (raw && KNOWN.has(raw)) return raw as ChatQuickSlotId;
  return DEFAULT_CHAT_QUICK_SLOT;
}

/**
 * Что показывать, когда закреплённое недоступно: ассистент выключен
 * администратором, а в слоте — он. Слот не пустеет, а берёт первую плитку.
 */
export function effectiveQuickSlot(
  pinned: ChatQuickSlotId,
  options: { assistantEnabled: boolean },
): ChatQuickSlotId {
  if (pinned === "assistant" && !options.assistantEnabled) return "photo";
  return pinned;
}
