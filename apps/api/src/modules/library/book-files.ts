import {
  LIBRARY_BOOK_FILES_PER_ENTRY,
  LIBRARY_BOOK_FORMATS,
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type LibraryBookFormat,
} from '@vedamatch/shared';

/**
 * Файлы книг в Образовании: правила приёма, ключи в бакете и имя при
 * скачивании. Чистые функции — сервис вокруг них ходит в базу и в S3, а
 * решения принимаются здесь и проверяются тестом.
 */

/**
 * Тип содержимого по формату. Берём его сами, а не у браузера: для djvu,
 * fb2 и mobi браузер часто присылает пустую строку, а тип входит в подпись
 * ссылки на заливку — разойдётся, и S3 ответит 403.
 */
export const BOOK_MIME: Record<LibraryBookFormat, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  fb2: 'application/x-fictionbook+xml',
  djvu: 'image/vnd.djvu',
  mobi: 'application/x-mobipocket-ebook',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
};

export type BookUploadRejection =
  | 'unsupported_book_format'
  | 'book_file_empty'
  | 'book_file_too_large'
  | 'too_many_book_files';

/** Почему заявку на заливку не принять; `null` — принять. */
export function bookUploadRejection(input: {
  fileName: unknown;
  sizeBytes: unknown;
  filesCount: number;
}): BookUploadRejection | null {
  if (
    typeof input.fileName !== 'string' ||
    !libraryBookFormatOf(input.fileName)
  ) {
    return 'unsupported_book_format';
  }
  if (
    typeof input.sizeBytes !== 'number' ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return 'book_file_empty';
  }
  if (input.sizeBytes > LIBRARY_BOOK_MAX_BYTES) return 'book_file_too_large';
  if (input.filesCount >= LIBRARY_BOOK_FILES_PER_ENTRY) {
    return 'too_many_book_files';
  }
  return null;
}

const KEY_PREFIX = 'library/books';

/** Ключ объекта. Запись в пути — по префиксу видно, чей это файл. */
export function bookFileKey(
  entryId: string,
  format: LibraryBookFormat,
  id: string,
): string {
  return `${KEY_PREFIX}/${entryId}/${id}.${format}`;
}

/**
 * Формат по ключу, если ключ выдан именно этой записи; иначе `null`.
 *
 * Ключ приходит от браузера на завершении заливки. Без этой проверки к своей
 * записи можно было бы привязать чужой объект из общего бакета — обложку,
 * запись Музыки, вложение переписки — и раздавать его ссылкой.
 */
export function bookFormatOfKey(
  key: unknown,
  entryId: string,
): LibraryBookFormat | null {
  if (typeof key !== 'string') return null;
  const prefix = `${KEY_PREFIX}/${entryId}/`;
  if (!key.startsWith(prefix)) return null;
  const match = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(key.slice(prefix.length));
  const format = match?.[1];
  return format && (LIBRARY_BOOK_FORMATS as readonly string[]).includes(format)
    ? (format as LibraryBookFormat)
    : null;
}

const MAX_NAME_STEM = 150;

/**
 * Имя файла для списка и для скачивания: без пути, управляющих символов и
 * кавычек, с расширением по настоящему формату, а не по тому, что прислали.
 */
export function bookFileName(raw: unknown, format: LibraryBookFormat): string {
  const base = typeof raw === 'string' ? (raw.split(/[\\/]/).pop() ?? '') : '';
  // Управляющий символ — пробел, а не пустота: табуляция между словами
  // иначе склеила бы их в одно.
  const printable = Array.from(base)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || code === 127) return ' ';
      return ch === '"' ? '' : ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const stem = printable.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  const cut = Array.from(stem).slice(0, MAX_NAME_STEM).join('').trim();
  return `${cut || 'book'}.${format}`;
}

/**
 * Заголовок Content-Disposition для скачивания.
 *
 * Имя двумя способами: `filename*` в UTF-8 для нынешних браузеров и
 * ASCII-замена в `filename` для старых — иначе «Бхагавад-гита.pdf»
 * сохранялась бы набором процентов. PDF открываем прямо в браузере,
 * остальное отдаём файлом: epub или djvu браузер показать не умеет.
 */
export function bookDisposition(
  name: string,
  format: LibraryBookFormat,
): string {
  const kind = format === 'pdf' ? 'inline' : 'attachment';
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
