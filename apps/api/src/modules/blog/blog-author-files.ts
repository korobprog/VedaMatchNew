import {
  BLOG_AUTHOR_FILE_FORMATS,
  BLOG_AUTHOR_FILE_MAX_BYTES,
  BLOG_AUTHOR_FILES_MAX,
  blogAuthorFileFormatOf,
  type BlogAuthorFileFormat,
  type BlogAuthorFileKind,
} from '@vedamatch/shared';

/**
 * Файлы личной страницы автора (VED-686, часть 2): правила приёма, ключи в
 * бакете и имя при скачивании. Копия `vedabase/book-files.ts` — контракт
 * модуля запрещает импортировать хелперы другого сервиса; ключ привязан к
 * автору, а не к книге, лимиты зависят от вида файла.
 */

/**
 * Тип содержимого по формату. Берём его сами, а не у браузера: он часто
 * присылает пустую строку, а тип входит в подпись ссылки на заливку —
 * разойдётся, и S3 ответит 403.
 */
export const AUTHOR_FILE_MIME: Record<BlogAuthorFileFormat, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mov: 'video/quicktime',
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
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export type AuthorFileUploadRejection =
  | 'unsupported_file_format'
  | 'file_empty'
  | 'file_too_large'
  | 'too_many_files';

/** Почему заявку на заливку не принять; `null` — принять. */
export function authorFileUploadRejection(input: {
  fileName: unknown;
  sizeBytes: unknown;
  filesCount: number;
}): AuthorFileUploadRejection | null {
  const format =
    typeof input.fileName === 'string'
      ? blogAuthorFileFormatOf(input.fileName)
      : null;
  if (!format) return 'unsupported_file_format';
  if (
    typeof input.sizeBytes !== 'number' ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return 'file_empty';
  }
  if (input.sizeBytes > authorFileMaxBytes(format)) return 'file_too_large';
  if (input.filesCount >= BLOG_AUTHOR_FILES_MAX) return 'too_many_files';
  return null;
}

/** Вид файла по формату. */
export function authorFileKind(
  format: BlogAuthorFileFormat,
): BlogAuthorFileKind {
  return BLOG_AUTHOR_FILE_FORMATS[format];
}

/** Потолок размера для формата: у ролика он свой, у документа свой. */
export function authorFileMaxBytes(format: BlogAuthorFileFormat): number {
  return BLOG_AUTHOR_FILE_MAX_BYTES[authorFileKind(format)];
}

const KEY_PREFIX = 'blog/authors';

/** Ключ объекта. Автор в пути — по префиксу видно, чей это файл. */
export function authorFileKey(
  userId: string,
  format: BlogAuthorFileFormat,
  id: string,
): string {
  return `${KEY_PREFIX}/${userId}/${id}.${format}`;
}

/**
 * Формат по ключу, если ключ выдан именно этому автору; иначе `null`.
 *
 * Ключ приходит от браузера на завершении заливки. Без строгой проверки
 * префикса и uuid к своей странице можно было бы привязать чужой объект из
 * общего бакета — обложку, запись Музыки, вложение переписки — и раздавать
 * его подписанной ссылкой.
 */
export function authorFileFormatOfKey(
  key: unknown,
  userId: string,
): BlogAuthorFileFormat | null {
  if (typeof key !== 'string') return null;
  const prefix = `${KEY_PREFIX}/${userId}/`;
  if (!key.startsWith(prefix)) return null;
  const match = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(key.slice(prefix.length));
  const format = match?.[1];
  return format &&
    Object.prototype.hasOwnProperty.call(BLOG_AUTHOR_FILE_FORMATS, format)
    ? (format as BlogAuthorFileFormat)
    : null;
}

const MAX_NAME_STEM = 150;

/**
 * Имя файла для списка и для скачивания: без пути, управляющих символов и
 * кавычек, с расширением по настоящему формату, а не по тому, что прислали.
 */
export function authorFileName(
  raw: unknown,
  format: BlogAuthorFileFormat,
): string {
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
  return `${cut || 'file'}.${format}`;
}

/**
 * Content-Disposition с именем двумя способами: `filename*` в UTF-8 для
 * нынешних браузеров и ASCII-замена в `filename` для старых.
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

/**
 * Аудио, видео, pdf и txt браузер показывает или играет сам — отдаём inline;
 * остальное (epub, docx, xlsx…) он всё равно не покажет, значит файлом.
 */
export function authorFileDisposition(
  name: string,
  format: BlogAuthorFileFormat,
): string {
  const inline =
    authorFileKind(format) !== 'document' ||
    format === 'pdf' ||
    format === 'txt';
  return contentDisposition(inline ? 'inline' : 'attachment', name);
}
