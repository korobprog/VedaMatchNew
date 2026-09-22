/**
 * Правила аватара — клиентское зеркало сервера
 * (`apps/api/src/modules/users/users.service.ts`: `AVATAR_MIME_EXTENSIONS`,
 * `MAX_AVATAR_SIZE`).
 *
 * Отдельно от `lib/chat/chat-upload-rules.ts`, хотя оба про картинки:
 * наборы НЕ совпадают. Вложение чата принимает ещё и `image/gif` при
 * потолке 10 МБ, аватар — только jpeg/png/webp при 5 МБ, и `PutObject`
 * на сервере кладёт файл по расширению из этой же таблицы. Свести их в
 * один набор значит либо разрешить гифку аватаром (сервер отобьёт 400
 * после загрузки всего файла по мобильной сети), либо запретить её в
 * переписке. Дублируется здесь только таблица — сам путь отправки один
 * на всё приложение, `lib/upload/upload-form-part.ts`.
 */

import type { UploadSource } from '@/lib/upload/upload-form-part';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** MIME → расширение: ровно то, что принимает `uploadAvatar` на сервере. */
export const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type AvatarDenial = 'unsupported_type' | 'file_too_large';

export interface AvatarCandidate extends UploadSource {
  /** 0 — размер не пришёл от галереи/камеры: решает сервер, локально не отказываем. */
  sizeBytes: number;
}

/** `null` — файл проходит локальную проверку. */
export function validateAvatar(candidate: Pick<AvatarCandidate, 'type' | 'sizeBytes'>): AvatarDenial | null {
  if (!AVATAR_MIME_EXTENSIONS[candidate.type]) return 'unsupported_type';
  if (candidate.sizeBytes > MAX_AVATAR_BYTES) return 'file_too_large';
  return null;
}

export function avatarDenialMessage(denial: AvatarDenial): string {
  return denial === 'file_too_large'
    ? 'Фото слишком большое — до 5 МБ.'
    : 'Такое фото не подойдёт. Нужен JPEG, PNG или WebP.';
}

/** Расширение из пути, когда галерея не сообщила MIME (бывает на части прошивок). */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  // Заведомо неподходящие тоже узнаются: так человек получит точный отказ
  // «нужен JPEG, PNG или WebP», а не беспомощное «не удалось определить тип».
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

function inferAvatarMime(uri: string): string | null {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  return extension ? (EXTENSION_MIME[extension] ?? null) : null;
}

/** Снимок ассета `expo-image-picker` — только поля, которые нужны аватару. */
export interface PickedAvatarAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

/**
 * Ассет галереи/камеры → кандидат на отправку. `null` — MIME не определить
 * ни из ассета, ни из расширения пути; неподходящий, но опознанный тип
 * возвращается как есть и отсеивается `validateAvatar` — иначе вместо
 * «нужен JPEG, PNG или WebP» человек увидел бы невнятное «не удалось
 * определить тип фото» и не понял бы, что делать.
 *
 * Имя файла своё, а не из ассета: обрезка в `expo-image-picker` отдаёт
 * временный файл вида `ImagePicker-<uuid>.jpg`, и класть такое в хранилище
 * незачем — сервер всё равно переименует ключ в `users/<id>/avatar.<ext>`,
 * а в его отказе человеку понятнее увидеть `avatar.jpg`.
 */
export function normalizePickedAvatar(asset: PickedAvatarAsset): AvatarCandidate | null {
  const type = asset.mimeType ?? inferAvatarMime(asset.uri);
  if (!type) return null;
  const extension = AVATAR_MIME_EXTENSIONS[type] ?? (type.split('/')[1] || 'bin');
  return {
    uri: asset.uri,
    name: `avatar.${extension}`,
    type,
    sizeBytes: asset.fileSize ?? 0,
  };
}
