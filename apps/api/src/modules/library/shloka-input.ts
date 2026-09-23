import {
  LIBRARY_SHLOKA_LIMITS,
  type LibraryShlokaAcharyaInput,
} from '@vedamatch/shared';

/**
 * Разбор полей шлоки из запроса (VED-386): чистка текста, обязательные поля
 * и пределы. Отдельным модулем, чтобы правило проверялось тестом без базы и
 * было одно на создание и правку.
 */

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SOURCE_LENGTH = 300;

/**
 * Многострочный текст как его вставили: переводы строк Windows приводим к
 * `\n`, хвостовые пробелы строк и лишние пустые строки убираем. Строки
 * стиха держатся на одиночных переводах строки — их не трогаем.
 * Пустое — `null`: пустая строка в базе читалась бы как «поле заполнено».
 */
export function cleanMultiline(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text : null;
}

/** Однострочное поле: номер стиха, источник, имя ачарьи. */
export function cleanLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

export interface ShlokaTextFields {
  verse: string | null;
  text: string | null;
  wordByWord: string | null;
  translation: string | null;
  commentary: string | null;
}

/** Код ошибки для 400 либо `null`, если поля годятся. */
export function shlokaFieldsError(fields: ShlokaTextFields): string | null {
  if (!fields.text) return 'text_required';
  if (fields.text.length > LIBRARY_SHLOKA_LIMITS.text) return 'text_too_long';
  if (fields.verse && fields.verse.length > LIBRARY_SHLOKA_LIMITS.verse)
    return 'verse_too_long';
  if (
    fields.wordByWord &&
    fields.wordByWord.length > LIBRARY_SHLOKA_LIMITS.wordByWord
  )
    return 'word_by_word_too_long';
  if (
    fields.translation &&
    fields.translation.length > LIBRARY_SHLOKA_LIMITS.translation
  )
    return 'translation_too_long';
  if (
    fields.commentary &&
    fields.commentary.length > LIBRARY_SHLOKA_LIMITS.commentary
  )
    return 'commentary_too_long';
  return null;
}

export function sourceError(source: string | null): string | null {
  if (!source) return 'source_required';
  if (source.length > MAX_SOURCE_LENGTH) return 'source_too_long';
  return null;
}

export interface CleanAcharya {
  id: string | null;
  acharya: string;
  text: string | null;
  wordByWord: string | null;
  translation: string | null;
  commentary: string | null;
}

export type AcharyasResult =
  { ok: true; acharyas: CleanAcharya[] } | { ok: false; error: string };

/**
 * Блоки «других ачарьев». Имя обязательно, и хотя бы одно поле кроме имени:
 * пустой блок с одним именем на странице выглядел бы поломкой. Пределы
 * полей — те же, что у самой шлоки.
 */
export function cleanAcharyas(value: unknown): AcharyasResult {
  if (value === undefined || value === null) return { ok: true, acharyas: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'acharyas_invalid' };
  if (value.length > LIBRARY_SHLOKA_LIMITS.acharyas)
    return { ok: false, error: 'too_many_acharyas' };

  const acharyas: CleanAcharya[] = [];
  for (const raw of value as Array<Partial<LibraryShlokaAcharyaInput>>) {
    if (!raw || typeof raw !== 'object')
      return { ok: false, error: 'acharyas_invalid' };
    const acharya = cleanLine(raw.acharya);
    if (!acharya) return { ok: false, error: 'acharya_name_required' };
    if (acharya.length > LIBRARY_SHLOKA_LIMITS.acharyaName)
      return { ok: false, error: 'acharya_name_too_long' };
    const block: CleanAcharya = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : null,
      acharya,
      text: cleanMultiline(raw.text),
      wordByWord: cleanMultiline(raw.wordByWord),
      translation: cleanMultiline(raw.translation),
      commentary: cleanMultiline(raw.commentary),
    };
    if (
      !block.text &&
      !block.wordByWord &&
      !block.translation &&
      !block.commentary
    )
      return { ok: false, error: 'acharya_empty' };
    const error = shlokaFieldsError({
      verse: null,
      // Текст у блока ачарьи необязателен — проверяем только длину.
      text: block.text ?? '-',
      wordByWord: block.wordByWord,
      translation: block.translation,
      commentary: block.commentary,
    });
    if (error) return { ok: false, error: `acharya_${error}` };
    acharyas.push(block);
  }
  return { ok: true, acharyas };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Заголовок материала-шлоки — для ленты, поиска, избранного и хлебных
 * крошек. Отдельного поля в форме нет: у шлоки имя — это источник и номер
 * («Бхагавад-гита 2.13»). Без номера — источник и начало первой строки.
 */
export function shlokaTitle(
  source: string,
  verse: string | null,
  text: string,
): string {
  if (verse) return clip(`${source} ${verse}`, MAX_TITLE_LENGTH);
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return clip(`${source}: ${firstLine}`, MAX_TITLE_LENGTH);
}

/**
 * Описание материала — то, что карточка ленты показывает под заголовком и
 * по чему ищет общий поиск. Перевод понятнее всего; без него — пословный.
 */
export function shlokaDescription(
  translation: string | null,
  wordByWord: string | null,
): string | null {
  const value = translation ?? wordByWord;
  return value
    ? clip(value.replace(/\s+/g, ' '), MAX_DESCRIPTION_LENGTH)
    : null;
}

/** Начало текста для строки списка — не весь комментарий. */
export function preview(value: string | null, max: number): string | null {
  return value ? clip(value.replace(/\s+/g, ' ').trim(), max) : null;
}
