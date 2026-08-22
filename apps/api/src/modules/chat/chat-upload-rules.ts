import type { ChatAttachmentKind } from '@vedamatch/shared';

/**
 * Что можно приложить к сообщению. Отдельным модулем от самой загрузки:
 * решения тут — размеры, типы и вид вложения по MIME — проверяются тестом,
 * а обёртка над S3 не тестируется.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VOICE_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_VOICE_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
]);

/**
 * Документы, которые действительно передают друг другу: расписания,
 * методички, счета. Исполняемое и архивы не принимаем — портал не файлообмен.
 */
export const ALLOWED_FILE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export type UploadDenial = 'unsupported_type' | 'file_too_large';

export interface UploadCandidate {
  mimetype: string;
  size: number;
}

/** Вид вложения по MIME. `null` — такое не принимаем вовсе. */
export function attachmentKindFor(
  mimetype: string,
): Extract<ChatAttachmentKind, 'image' | 'voice' | 'file'> | null {
  if (ALLOWED_IMAGE_MIME.has(mimetype)) return 'image';
  if (ALLOWED_VOICE_MIME.has(mimetype)) return 'voice';
  if (ALLOWED_FILE_MIME.has(mimetype)) return 'file';
  return null;
}

export function maxBytesFor(
  kind: Extract<ChatAttachmentKind, 'image' | 'voice' | 'file'>,
): number {
  if (kind === 'image') return MAX_IMAGE_BYTES;
  if (kind === 'voice') return MAX_VOICE_BYTES;
  return MAX_FILE_BYTES;
}

/** `null` — файл принимается. */
export function validateUpload(
  file: UploadCandidate | undefined,
): UploadDenial | null {
  if (!file) return 'unsupported_type';
  const kind = attachmentKindFor(file.mimetype);
  if (!kind) return 'unsupported_type';
  if (file.size > maxBytesFor(kind)) return 'file_too_large';
  return null;
}
