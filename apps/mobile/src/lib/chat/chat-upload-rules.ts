import { CHAT_MAX_ATTACHMENTS } from '@vedamatch/shared';
import type { ChatAttachmentKind } from '@vedamatch/shared';

/**
 * Клиентское зеркало серверных правил вложений
 * (`apps/api/src/modules/chat/chat-upload-rules.ts`). Контракт сервисного
 * модуля запрещает импортировать чужой модуль — числа и списки MIME
 * дублируются, чтобы отказать до сетевого запроса, а не ждать 415 от
 * сервера. Голосовые (VED-286) пишутся только в одном формате
 * (`voice-recording-options.ts`), поэтому `ALLOWED_VOICE_MIME` здесь короче
 * серверного набора — тот принимает ещё и то, что шлёт браузер сайта.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_FILE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ALLOWED_VOICE_MIME = new Set(['audio/mp4']);

export type UploadKind = Extract<ChatAttachmentKind, 'image' | 'file' | 'voice'>;
export type UploadDenial = 'unsupported_type' | 'file_too_large';

export interface UploadCandidate {
  mimeType: string;
  sizeBytes: number;
}

export function attachmentKindFor(mimeType: string): UploadKind | null {
  if (ALLOWED_IMAGE_MIME.has(mimeType)) return 'image';
  if (ALLOWED_FILE_MIME.has(mimeType)) return 'file';
  if (ALLOWED_VOICE_MIME.has(mimeType)) return 'voice';
  return null;
}

export function maxBytesFor(kind: UploadKind): number {
  if (kind === 'image') return MAX_IMAGE_BYTES;
  if (kind === 'voice') return MAX_VOICE_BYTES;
  return MAX_FILE_BYTES;
}

/** `null` — файл принимается локальной проверкой. */
export function validateUpload(candidate: UploadCandidate): UploadDenial | null {
  const kind = attachmentKindFor(candidate.mimeType);
  if (!kind) return 'unsupported_type';
  if (candidate.sizeBytes > maxBytesFor(kind)) return 'file_too_large';
  return null;
}

export function uploadDenialMessage(denial: UploadDenial): string {
  return denial === 'file_too_large'
    ? 'Файл слишком большой. Фото — до 10 МБ, документы — до 25 МБ.'
    : 'Такой файл нельзя отправить. Подходят фото (JPEG, PNG, WebP, GIF) и документы (PDF, Word, Excel, текст).';
}

/**
 * Сколько вложений ещё можно набрать. Считается по «занятым» местам —
 * не только уже загруженным, но и тем, что ещё грузятся: иначе камера
 * (один файл за раз, без `selectionLimit` галереи) может уйти в S3 поверх
 * лимита, который потом молча обрежет `addAttachment` (найдено в раунде
 * оценки 002 — «Снять на камеру» не проверяла лимит).
 */
export function remainingAttachmentSlots(occupiedCount: number, max: number = CHAT_MAX_ATTACHMENTS): number {
  return Math.max(0, max - occupiedCount);
}

/** Можно ли вообще открывать галерею/камеру/файл — лимит ещё не исчерпан. */
export function canPickAttachment(occupiedCount: number, max: number = CHAT_MAX_ATTACHMENTS): boolean {
  return remainingAttachmentSlots(occupiedCount, max) > 0;
}

/** Расширение из пути, когда галерея не отдала MIME (редко, но бывает). */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function inferImageMime(uri: string): string | null {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return ext ? (EXTENSION_MIME[ext] ?? null) : null;
}

/** Часть тела `multipart/form-data` для `FormData.append('file', …)` в RN. */
export interface UploadFilePart {
  uri: string;
  name: string;
  type: string;
}

/** Нормализованное вложение: то, что уходит и в проверку, и в форму. */
export interface NormalizedUpload extends UploadFilePart {
  sizeBytes: number;
  width?: number;
  height?: number;
}

export function buildUploadFilePart(upload: NormalizedUpload): UploadFilePart {
  return { uri: upload.uri, name: upload.name, type: upload.type };
}

/** Снимок ассета `expo-image-picker` — только поля, которые реально нужны. */
export interface PickedImageAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
}

/** `null` — MIME не определить ни из ассета, ни из расширения пути. */
export function normalizePickedImage(asset: PickedImageAsset, seed = Date.now()): NormalizedUpload | null {
  const mimeType = asset.mimeType ?? inferImageMime(asset.uri);
  if (!mimeType) return null;
  const extension = mimeType.split('/')[1] ?? 'jpg';
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${seed}.${extension}`,
    type: mimeType,
    // Размер иногда не приходит (некоторые прошивки для камеры) — тогда
    // локальная проверка размера бессильна, решает сервер.
    sizeBytes: asset.fileSize ?? 0,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  };
}

/** Снимок ассета `expo-document-picker`. */
export interface PickedDocumentAsset {
  uri: string;
  mimeType?: string | null;
  name: string;
  size?: number | null;
}

/** `null` — без MIME документ не классифицировать, показываем отказ. */
export function normalizePickedDocument(asset: PickedDocumentAsset): NormalizedUpload | null {
  if (!asset.mimeType) return null;
  return { uri: asset.uri, name: asset.name, type: asset.mimeType, sizeBytes: asset.size ?? 0 };
}
