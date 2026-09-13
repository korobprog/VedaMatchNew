import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECENT_EMOJIS,
  EMOJI_TABS,
  RECENT_EMOJI_MAX,
  groupEmojiRows,
  insertAtCaret,
  parseRecentEmojis,
  searchEmojis,
  withRecentEmoji,
  type EmojiRow,
} from "./emoji-picker";
import { EMOJI_ROWS } from "./emoji-data";

const rows: EmojiRow[] = [
  ["😀", 0, "широко улыбается", "радость смех"],
  ["😻", 0, "улыбающийся кот с сердечками", "любовь"],
  ["🐶", 1, "морда собаки", "пёс"],
  ["❤️", 6, "алое сердце", "любовь"],
  ["🫀", 0, "анатомическое сердце", "орган"],
];

describe("groupEmojiRows", () => {
  it("раскладывает по вкладкам в порядке мессенджеров", () => {
    const groups = groupEmojiRows(rows);
    expect(groups).toHaveLength(EMOJI_TABS.length);
    expect(groups[0].map(([emoji]) => emoji)).toEqual(["😀", "😻", "🫀"]);
    expect(groups[1].map(([emoji]) => emoji)).toEqual(["🐶"]);
    expect(groups[6].map(([emoji]) => emoji)).toEqual(["❤️"]);
  });
});

describe("searchEmojis", () => {
  it("ищет по началу слов названия и тегов", () => {
    expect(searchEmojis(rows, "серд").map(([emoji]) => emoji)).toEqual([
      "😻",
      "❤️",
      "🫀",
    ]);
    expect(searchEmojis(rows, "любовь").map(([emoji]) => emoji)).toEqual([
      "😻",
      "❤️",
    ]);
  });

  it("все слова запроса должны найтись", () => {
    expect(searchEmojis(rows, "кот улыб").map(([emoji]) => emoji)).toEqual([
      "😻",
    ]);
  });

  it("середина слова не считается: «от» не находит «кот»", () => {
    expect(searchEmojis(rows, "от")).toEqual([]);
  });

  it("регистр не важен, пустой запрос — пусто", () => {
    expect(searchEmojis(rows, "ПЁС").map(([emoji]) => emoji)).toEqual(["🐶"]);
    expect(searchEmojis(rows, "   ")).toEqual([]);
  });
});

describe("parseRecentEmojis / withRecentEmoji", () => {
  it("без истории — прежний быстрый ряд", () => {
    expect(parseRecentEmojis(null)).toEqual(DEFAULT_RECENT_EMOJIS);
    expect(parseRecentEmojis("не json")).toEqual(DEFAULT_RECENT_EMOJIS);
    expect(parseRecentEmojis("[]")).toEqual(DEFAULT_RECENT_EMOJIS);
  });

  it("читает сохранённое и отбрасывает мусор", () => {
    expect(parseRecentEmojis(JSON.stringify(["🐶", 5, "", "❤️"]))).toEqual([
      "🐶",
      "❤️",
    ]);
  });

  it("выбранный встаёт первым, без повторов и не длиннее предела", () => {
    const full = Array.from({ length: RECENT_EMOJI_MAX }, (_, i) =>
      String.fromCodePoint(0x1f600 + i),
    );
    const next = withRecentEmoji(full, full[5]);
    expect(next[0]).toBe(full[5]);
    expect(new Set(next).size).toBe(next.length);
    expect(withRecentEmoji(full, "🐶")).toHaveLength(RECENT_EMOJI_MAX);
  });
});

describe("insertAtCaret", () => {
  it("вставляет туда, где курсор, и ставит курсор после смайлика", () => {
    expect(insertAtCaret("Харе Кришна", "🙏", 4, 4)).toEqual({
      text: "Харе🙏 Кришна",
      caret: 6,
    });
  });

  it("заменяет выделенное", () => {
    expect(insertAtCaret("Харе Кришна", "❤️", 5, 11).text).toBe("Харе ❤️");
  });

  it("без курсора — в конец", () => {
    expect(insertAtCaret("Привет", "😀", undefined, undefined)).toEqual({
      text: "Привет😀",
      caret: 8,
    });
  });
});

describe("набор смайликов", () => {
  // Файл собирается скриптом: проверяем, что сборка не сломала форму.
  it("есть в каждой вкладке, и у каждого — название", () => {
    const groups = groupEmojiRows(EMOJI_ROWS);
    for (const group of groups) expect(group.length).toBeGreaterThan(50);
    expect(EMOJI_ROWS.every(([emoji, , label]) => emoji && label)).toBe(true);
    expect(new Set(EMOJI_ROWS.map(([emoji]) => emoji)).size).toBe(
      EMOJI_ROWS.length,
    );
  });
});
