/**
 * Собирает набор смайликов для панели в переписке (VED-122).
 *
 * Источник — emojibase-data (MIT): официальные данные Unicode с русскими
 * названиями и тегами. Сам пакет весит десятки мегабайт — в нём все языки, —
 * поэтому в браузер он не едет: скрипт один раз вытаскивает нужное в
 * компактный файл, и файл лежит в репозитории.
 *
 * Запуск: pnpm --filter @vedamatch/web emoji:data
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const data = JSON.parse(
  await readFile(require.resolve("emojibase-data/ru/data.json"), "utf8"),
);

/**
 * Новее этой версии Unicode не берём: смайлик, которого нет в шрифте
 * телефона собеседника, приходит к нему пустым квадратом. Emoji 14 (2021) —
 * то, что уже умеют и Android 12, и iOS 15.4.
 */
const MAX_VERSION = 14;

/**
 * Группы emojibase → вкладки панели, в порядке мессенджеров. «Смайлики» и
 * «люди» у Unicode разные группы, но во всех мессенджерах это одна вкладка.
 * Группа 2 — «компоненты» (оттенки кожи, причёски сами по себе) — не смайлики,
 * их не показываем.
 */
const TAB_OF_GROUP = { 0: 0, 1: 0, 3: 1, 4: 2, 6: 3, 5: 4, 7: 5, 8: 6, 9: 7 };

const rows = data
  .filter((entry) => entry.group !== undefined && entry.group in TAB_OF_GROUP)
  .filter((entry) => Number(entry.version) <= MAX_VERSION)
  .sort(
    (a, b) =>
      TAB_OF_GROUP[a.group] - TAB_OF_GROUP[b.group] || a.order - b.order,
  )
  .map((entry) => {
    // Название — подпись кнопки для скринридера и первое, по чему ищут.
    // Теги — добавочные слова для поиска: «любовь» находит и «алое сердце».
    // Слова, которые уже есть в названии, не повторяем — файл едет в телефон.
    const label = entry.label.toLowerCase();
    const inLabel = new Set(label.split(/\s+/));
    const extra = [
      ...new Set(
        (entry.tags ?? [])
          .join(" ")
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word && !inLabel.has(word)),
      ),
    ].join(" ");
    const tab = TAB_OF_GROUP[entry.group];
    return extra ? [entry.emoji, tab, label, extra] : [entry.emoji, tab, label];
  });

const header = `/**
 * Смайлики для панели в переписке (VED-122). Файл собран скриптом
 * scripts/build-emoji-data.mjs из emojibase-data ${
   require("emojibase-data/package.json").version
 } — руками не править.
 *
 * Строка: смайлик, вкладка (см. EMOJI_TABS), название, добавочные слова для
 * поиска.
 */
`;

const body = `export const EMOJI_ROWS: ReadonlyArray<
  readonly [emoji: string, tab: number, label: string, extra?: string]
> = ${JSON.stringify(
  rows,
)};\n`;

const target = fileURLToPath(
  new URL("../src/components/chat/emoji-data.ts", import.meta.url),
);
await writeFile(target, header + body, "utf8");
console.log(`emoji-data.ts: ${rows.length} смайликов`);
