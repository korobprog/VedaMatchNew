import { sortByVerse } from './shloka-order';

/**
 * Папки-источники раздела «Шлоки» (VED-465).
 *
 * Источник у шлоки — свободная строка, которую человек пишет сам (VED-464):
 * «Бхагавад-гита», «бхагавад-гита », «Бхагавад–гита». Папка — все шлоки с
 * одним и тем же источником, если не смотреть на регистр, пробелы, «ё» и
 * вид тире. Отдельной таблицы источников нет: папки собираются из записей.
 */

/**
 * Ключ папки для шлок без источника. Нормализованный источник им не
 * бывает: строка без единой буквы и цифры источником не считается.
 */
export const NO_SOURCE_KEY = '_';

/** Сколько знаков строки стиха отдавать списку: дальше всё равно многоточие. */
const LINE_MAX = 160;

/** Ключ папки по строке источника. */
export function shlokaSourceKey(raw: string | null | undefined): string {
  const text = (raw ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : NO_SOURCE_KEY;
}

export interface SourcedShloka {
  id: string;
  source: string | null;
  publishedAt: Date;
}

export interface SourceFolder {
  key: string;
  /** Как источник записан чаще всего; `null` — папка «Без источника». */
  label: string | null;
  count: number;
}

/**
 * Папки по источнику: подпись — самое частое написание (при равенстве —
 * самое раннее), порядок — по алфавиту подписи, «Без источника» — в конце.
 */
export function groupBySource(rows: readonly SourcedShloka[]): SourceFolder[] {
  type Spellings = Map<string, { count: number; first: number }>;
  const groups = new Map<string, { count: number; spellings: Spellings }>();
  for (const row of rows) {
    const key = shlokaSourceKey(row.source);
    const group = groups.get(key) ?? {
      count: 0,
      spellings: new Map() as Spellings,
    };
    group.count += 1;
    if (key !== NO_SOURCE_KEY) {
      const spelling = (row.source ?? '').replace(/\s+/g, ' ').trim();
      const seen = group.spellings.get(spelling);
      const at = row.publishedAt.getTime();
      group.spellings.set(spelling, {
        count: (seen?.count ?? 0) + 1,
        first: Math.min(seen?.first ?? at, at),
      });
    }
    groups.set(key, group);
  }

  const folders = [...groups.entries()].map(([key, group]): SourceFolder => {
    if (key === NO_SOURCE_KEY) return { key, label: null, count: group.count };
    const [label] = [...group.spellings.entries()].sort(
      ([, a], [, b]) => b.count - a.count || a.first - b.first,
    )[0];
    return { key, label, count: group.count };
  });
  return folders.sort((a, b) => {
    if (a.label === null) return b.label === null ? 0 : 1;
    if (b.label === null) return -1;
    return a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' });
  });
}

export interface FolderShloka {
  id: string;
  verse: string | null;
  publishedAt: Date;
}

/**
 * Порядок внутри папки: стихи с номером, в котором есть цифры («2.13»,
 * «1.7.7», «Мадхья 20.108»), — по номеру; остальные — после них по дате
 * добавления. Номер без цифр («Предисловие») порядка не задаёт.
 */
export function sortFolder<T extends FolderShloka>(items: readonly T[]): T[] {
  const keyed = items.map((item) => ({
    item,
    id: item.id,
    publishedAt: item.publishedAt,
    verse: item.verse && /\d/.test(item.verse) ? item.verse : null,
  }));
  return sortByVerse(keyed).map(({ item }) => item);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Строка шлоки в списке папки: первая непустая строка стиха, а без
 * оригинала (VED-464) — начало перевода.
 */
export function shlokaFirstLine(
  text: string | null,
  translation: string | null,
): { line: string; from: 'text' | 'translation' } {
  const first = (text ?? '')
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (first) return { line: clip(first, LINE_MAX), from: 'text' };
  const start = (translation ?? '').replace(/\s+/g, ' ').trim();
  return { line: clip(start, LINE_MAX), from: 'translation' };
}
