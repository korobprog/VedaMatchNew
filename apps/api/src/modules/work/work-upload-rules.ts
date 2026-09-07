/**
 * Что можно приложить к задаче. Отдельным модулем от самой загрузки:
 * решения тут — типы, размеры и вид вложения по MIME — проверяются тестом, а
 * обёртка над S3 не тестируется.
 *
 * Копия приёма из переписки. Контракт сервисного модуля запрещает
 * импортировать чужой сервис, поэтому дублирование здесь осознанное: списки
 * разъедутся, и это правильно — в задачу кладут скриншот и техзадание, а в
 * переписку ещё и голосовые, которых на доске не бывает.
 */

/**
 * Картинка — 10 МБ: скриншот экрана телефона со всеми деталями укладывается
 * вдвое меньше, а фотография доски из переговорки — впритык.
 */
export const MAX_WORK_IMAGE_BYTES = 10 * 1024 * 1024;

/** Документ — 25 МБ: смета и методичка со сканами. */
export const MAX_WORK_FILE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_WORK_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Документы, которые действительно прикладывают к задаче: техзадание, смета,
 * акт. Исполняемое и архивы не принимаем — портал не файлообмен, а вложение,
 * которое нельзя посмотреть в браузере, на доске бесполезно.
 */
export const ALLOWED_WORK_FILE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export type WorkUploadKind = 'image' | 'file';

export type WorkUploadDenial = 'unsupported_type' | 'file_too_large';

export interface WorkUploadCandidate {
  mimetype: string;
  size: number;
}

/** Вид вложения по MIME. `null` — такое не принимаем вовсе. */
export function workUploadKindFor(mimetype: string): WorkUploadKind | null {
  if (ALLOWED_WORK_IMAGE_MIME.has(mimetype)) return 'image';
  if (ALLOWED_WORK_FILE_MIME.has(mimetype)) return 'file';
  return null;
}

export function maxWorkBytesFor(kind: WorkUploadKind): number {
  return kind === 'image' ? MAX_WORK_IMAGE_BYTES : MAX_WORK_FILE_BYTES;
}

/** `null` — файл принимается. */
export function validateWorkUpload(
  file: WorkUploadCandidate | undefined,
): WorkUploadDenial | null {
  if (!file) return 'unsupported_type';
  const kind = workUploadKindFor(file.mimetype);
  if (!kind) return 'unsupported_type';
  if (file.size > maxWorkBytesFor(kind)) return 'file_too_large';
  return null;
}

/**
 * Имя вложения для списка. Своё имя файла человек узнаёт быстрее любого
 * заголовка, который мы могли бы придумать, но пустое и слишком длинное имя
 * ломает строку списка, а путь в имени («C:\\Users\\…\\скрин.png») приезжает
 * от старых браузеров и показывать его незачем.
 */
export const WORK_ATTACHMENT_NAME_MAX = 120;

export function workAttachmentName(
  originalname: string | undefined,
  kind: WorkUploadKind,
): string {
  const base = decodeMultipartName(originalname ?? '')
    .split(/[/\\]/)
    .pop()
    ?.trim();
  if (!base) return kind === 'image' ? 'Картинка' : 'Файл';
  if (base.length <= WORK_ATTACHMENT_NAME_MAX) return base;
  // Режем начало, а не конец: расширение говорит о файле больше, чем первые
  // сто знаков имени, и без него вложение выглядит сломанным.
  return `…${base.slice(base.length - WORK_ATTACHMENT_NAME_MAX + 1)}`;
}

/**
 * Имя файла из multipart приезжает побайтно, как latin1: «скрин.png» доходит
 * до нас «ÑÐºÑÐ¸Ð½.png» и таким же ложится в базу — проверено загрузкой с
 * телефона. Заголовок формы не носит кодировку, браузеры шлют туда UTF-8, а
 * разбор формы читает байты по одному.
 *
 * Перекодируем только то, что действительно похоже на испорченный UTF-8: все
 * знаки уложились в один байт и хотя бы один — не ASCII. Настоящее «скрин.png»
 * под это правило не попадает (кириллица там выше 0xFF) и остаётся нетронутым:
 * иначе починка ломала бы то, что доехало целым. Байты, не сложившиеся в
 * UTF-8, тоже оставляем как есть — портить чужую кодировку нечестнее, чем
 * показать её как пришла.
 */
function decodeMultipartName(raw: string): string {
  // По кодам, а не регуляркой: диапазон с \u0000 внутри регулярного выражения
  // запрещён правилом no-control-regex, и не зря — управляющий символ там
  // невидим при чтении.
  const codes = [...raw].map((char) => char.charCodeAt(0));
  const singleByte = codes.every((code) => code <= 0xff);
  const hasHighByte = codes.some((code) => code >= 0x80 && code <= 0xff);
  if (!singleByte || !hasHighByte) return raw;
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}
