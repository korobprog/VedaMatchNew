import type { LibraryEntryType } from '@vedamatch/shared';

/**
 * Текст материала — у катхи, которую читают прямо на странице.
 *
 * Отдельным модулем, потому что правила нужны и созданию, и правке: запись,
 * которую приняли при создании, обязана проходить и при сохранении правки.
 */

/**
 * Лекция на час — около 60 000 знаков, глава книги — до полутора сотен
 * тысяч. Предел с запасом на них, но не на книгу целиком: книге место в
 * файле, а не в поле формы.
 */
export const MAX_BODY_LENGTH = 200_000;

/**
 * Текст в том виде, в каком его стоит хранить: переводы строк одного вида,
 * без пробелов в конце строк и не больше одной пустой строки между
 * абзацами. `null` — текста нет.
 *
 * NUL вычищается не ради красоты: Postgres не хранит его в `text`, и
 * вставка падала бы ошибкой базы вместо ответа человеку. Такой символ
 * приезжает вместе с текстом, скопированным из старых документов.
 */
export function normalizeEntryBody(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .split(String.fromCharCode(0))
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/** То, на что материал указывает, — из этого складывается проверка ниже. */
export interface EntryLocators {
  type: LibraryEntryType;
  url: string | null;
  source: string | null;
  body: string | null;
}

/**
 * Код отказа, когда материалу не на что указывать; `null` — всё в порядке.
 *
 * Катхе нужен именно текст: без него остаётся пустая страница с заголовком.
 * Остальным хватает любого из трёх — того же требует CHECK-ограничение
 * `LibraryEntry_url_source_or_body` в базе. Проверка здесь нужна, чтобы
 * ответить человеку словами, а не ошибкой базы.
 */
export function entryLocatorError(
  entry: EntryLocators,
): 'body_required' | 'url_or_source_required' | null {
  if (entry.type === 'katha' && !entry.body) return 'body_required';
  if (!entry.url && !entry.source && !entry.body) {
    return 'url_or_source_required';
  }
  return null;
}
