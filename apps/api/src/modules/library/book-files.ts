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
 * fb2 и mobi браузер часто присылает пустую строку. Этим же типом книга
 * отдаётся при скачивании — он входит в подпись ссылки.
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
  return contentDisposition(format === 'pdf' ? 'inline' : 'attachment', name);
}

/**
 * Content-Disposition с именем файла двумя способами — см. bookDisposition.
 * Общий для книг и для скачивания обложки (VED-138).
 */
export function contentDisposition(
  kind: 'inline' | 'attachment',
  name: string,
): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Сколько первых байт объекта читаем, чтобы узнать формат по содержимому. */
export const BOOK_SNIFF_BYTES = 1024;

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK..
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf
const DJVU = [0x41, 0x54, 0x26, 0x54, 0x46, 0x4f, 0x52, 0x4d]; // AT&TFORM
const MOBI = [0x42, 0x4f, 0x4f, 0x4b, 0x4d, 0x4f, 0x42, 0x49]; // BOOKMOBI
const MOBI_OFFSET = 60;
const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasAt(head: Uint8Array, signature: number[], offset = 0): boolean {
  if (head.length < offset + signature.length) return false;
  return signature.every((byte, index) => head[offset + index] === byte);
}

function indexOf(head: Uint8Array, signature: number[]): number {
  for (let at = 0; at + signature.length <= head.length; at += 1) {
    if (hasAt(head, signature, at)) return at;
  }
  return -1;
}

/** Текст без BOM и ведущих пробелов — начало XML-документа. */
function leadingText(head: Uint8Array): string {
  const from = hasAt(head, UTF8_BOM) ? UTF8_BOM.length : 0;
  return Buffer.from(head.subarray(from, from + 256))
    .toString('latin1')
    .trimStart();
}

function isUtf16(head: Uint8Array): boolean {
  return hasAt(head, [0xff, 0xfe]) || hasAt(head, [0xfe, 0xff]);
}

/**
 * Похоже ли начало файла на заявленный формат.
 *
 * Формат приходит расширением имени, а `Content-Type` в подпись ссылки на
 * заливку не входит — библиотека подписи исключает его сама. Без сверки по
 * содержимому под видом `.pdf` в бакет ложится что угодно, и читатель
 * скачивает это как книгу.
 *
 * Правила мягкие там, где формат размыт: `.doc` из старых редакторов часто
 * оказывается RTF, а у `.txt` подписи нет вовсе — отбиваем только заведомо
 * двоичное.
 */
export function bookContentMatches(
  format: LibraryBookFormat,
  head: Uint8Array,
): boolean {
  switch (format) {
    case 'pdf':
      // Стандарт разрешает мусор перед заголовком в пределах первого килобайта.
      return indexOf(head, PDF) !== -1;
    case 'epub':
    case 'docx':
    case 'odt':
      return hasAt(head, ZIP);
    case 'djvu':
      return hasAt(head, DJVU);
    case 'mobi':
      return hasAt(head, MOBI, MOBI_OFFSET);
    case 'doc':
      return hasAt(head, OLE) || hasAt(head, RTF);
    case 'rtf':
      return hasAt(head, RTF);
    case 'fb2': {
      if (isUtf16(head)) return true;
      const text = leadingText(head);
      return text.startsWith('<?xml') || text.startsWith('<FictionBook');
    }
    case 'txt':
      return isUtf16(head) || !head.includes(0);
  }
}

/**
 * Сколько объект должен пролежать без строки в базе, чтобы считаться
 * брошенным. Ссылка на заливку живёт час; второй час — запас на завершение.
 */
export const BOOK_ORPHAN_MIN_AGE_MS = 2 * 60 * 60_000;

const BOOK_KEY = new RegExp(
  `^${KEY_PREFIX}/[^/]+/[0-9a-f-]{36}\\.(${LIBRARY_BOOK_FORMATS.join('|')})$`,
);

/** Префикс, под которым лежат файлы книг, — для обхода бакета. */
export const BOOK_KEY_PREFIX = `${KEY_PREFIX}/`;

/**
 * Ключи объектов, брошенных в бакете: залиты по подписанной ссылке, а строка
 * файла так и не появилась — вкладку закрыли, сеть оборвалась, удаление
 * объекта не прошло.
 *
 * Берём только ключи своего вида и только старые: свежий объект может ждать
 * завершения заливки, а чужой ключ под нашим префиксом — не наше дело.
 */
export function orphanBookKeys(
  objects: ReadonlyArray<{ key: string; lastModified: Date | null }>,
  knownKeys: ReadonlySet<string>,
  now: Date,
): string[] {
  const border = now.getTime() - BOOK_ORPHAN_MIN_AGE_MS;
  return objects
    .filter(
      (object) =>
        BOOK_KEY.test(object.key) &&
        !knownKeys.has(object.key) &&
        object.lastModified !== null &&
        object.lastModified.getTime() <= border,
    )
    .map((object) => object.key);
}

/**
 * Что записать в журнал админа о файле материала. Формулировку для человека
 * собирает журнал, здесь — только факт.
 */
export function bookFileAuditDetails(input: {
  entry: string;
  name: string;
  format: string;
  sizeBytes: number;
}): Record<string, string | number> {
  return {
    entry: input.entry,
    file: input.name,
    format: input.format,
    sizeBytes: input.sizeBytes,
  };
}
