import {
  CHAT_STATUS_IMAGE_MAX_BYTES,
  CHAT_STATUS_IMAGE_MIME_TYPES,
  CHAT_STATUS_TEXT_MAX,
  CHAT_STATUS_VIDEO_MAX_BYTES,
  CHAT_STATUS_VIDEO_MAX_SECONDS,
  CHAT_STATUS_VIDEO_MIME_TYPES,
  type ChatStatusMediaKind,
} from '@vedamatch/shared';

/**
 * Клиентское зеркало правил публикации статуса
 * (`apps/api/src/modules/chat/statuses/chat-status-rules.ts`): отказать до
 * отправки 50 МБ, а не после. Числа и списки MIME — общие константы из
 * `@vedamatch/shared`, формулировки — те же, что отвечает сервер. Сервер
 * всё равно проверяет сам: длительность ролика он снимает ffmpeg-ом, а
 * галерея её иногда не отдаёт.
 */

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function inferMime(uri: string): string | null {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return ext ? (EXTENSION_MIME[ext] ?? null) : null;
}

export function statusMediaKindFor(mimeType: string): ChatStatusMediaKind | null {
  if ((CHAT_STATUS_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'photo';
  if ((CHAT_STATUS_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return 'video';
  return null;
}

/** Снимок ассета `expo-image-picker` — только нужные поля. */
export interface PickedStatusAsset {
  uri: string;
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  /** У ролика — миллисекунды; у фото `null`. */
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}

/** Выбранный файл статуса: то, что уходит и в проверку, и в форму. */
export interface StatusMedia {
  uri: string;
  name: string;
  type: string;
  /** Что это по мнению пикера — для превью, когда MIME чужой (`video/3gpp`). */
  kind: ChatStatusMediaKind;
  sizeBytes: number;
  /** Секунды; `null` — пикер не сказал, решит сервер. */
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export function normalizePickedStatusMedia(asset: PickedStatusAsset, seed = Date.now()): StatusMedia {
  const pickerKind: ChatStatusMediaKind = asset.type === 'video' ? 'video' : 'photo';
  const type = asset.mimeType ?? inferMime(asset.uri) ?? (pickerKind === 'video' ? 'video/unknown' : 'image/unknown');
  const kind = statusMediaKindFor(type) ?? pickerKind;
  const extension = type.split('/')[1] ?? (kind === 'video' ? 'mp4' : 'jpg');
  return {
    uri: asset.uri,
    name: asset.fileName ?? `${kind === 'video' ? 'video' : 'photo'}-${seed}.${extension}`,
    type,
    kind,
    // Размер иногда не приходит (некоторые прошивки для камеры) — тогда
    // проверка размера бессильна, решает сервер.
    sizeBytes: asset.fileSize ?? 0,
    durationSec: typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration / 1000 : null,
    width: asset.width || null,
    height: asset.height || null,
  };
}

/** Почему файл не годится; `null` — годится. Тексты — как у сервера. */
export function statusMediaDenial(media: Pick<StatusMedia, 'type' | 'sizeBytes' | 'durationSec'>): string | null {
  const kind = statusMediaKindFor(media.type);
  if (!kind) return 'В статус можно приложить фото (JPEG, PNG, WebP) или видео (MP4, WebM)';
  const max = kind === 'photo' ? CHAT_STATUS_IMAGE_MAX_BYTES : CHAT_STATUS_VIDEO_MAX_BYTES;
  if (media.sizeBytes > max) return kind === 'photo' ? 'Фото больше 10 МБ' : 'Видео больше 50 МБ';
  // Доля секунды сверху — округление контейнера, сервер её тоже не заметит.
  if (kind === 'video' && media.durationSec !== null && media.durationSec > CHAT_STATUS_VIDEO_MAX_SECONDS + 0.5)
    return `Видео длиннее ${CHAT_STATUS_VIDEO_MAX_SECONDS} секунд`;
  return null;
}

/** Текст статуса: пустой без файла не публикуется, длинный — тоже. */
export function statusTextDenial(text: string, hasMedia: boolean): string | null {
  const trimmed = text.trim();
  if (trimmed.length > CHAT_STATUS_TEXT_MAX) return `Текст статуса длиннее ${CHAT_STATUS_TEXT_MAX} знаков`;
  if (!trimmed && !hasMedia) return 'Напишите текст или приложите фото или видео';
  return null;
}

/** Можно ли нажать «Опубликовать» — без сообщения, для состояния кнопки. */
export function canPublishStatus(input: { text: string; media: StatusMedia | null; pending: boolean }): boolean {
  if (input.pending) return false;
  if (input.media && statusMediaDenial(input.media)) return false;
  return statusTextDenial(input.text, Boolean(input.media)) === null;
}

/** Поле `text` формы: обрезанный, пустой не отправляется вовсе — как у сайта. */
export function statusFormText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** «0:23» — длительность ролика в превью. */
export function formatStatusDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '';
  const whole = Math.max(0, Math.round(sec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
