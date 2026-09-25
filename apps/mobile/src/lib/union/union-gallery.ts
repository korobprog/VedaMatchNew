import type { GeoSearchResult, UserPhotoDto, UserPhotoUploadResponse } from '@vedamatch/shared';

/**
 * Фото анкеты и место жительства — чистая часть экранов «Моя анкета» и
 * «Место» (`user-gallery-editor.tsx` и `union-location-onboarding.tsx` сайта).
 *
 * Фото анкеты — это портальная галерея (`/profile/photos`): те же снимки
 * видны в профиле, а в Знакомствах — только открытые (`isPublic`).
 */

/** Столько принимает сервер галереи: JPEG, PNG и WebP до 20 МБ. */
export const GALLERY_MAX_BYTES = 20 * 1024 * 1024;
const GALLERY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTENSION_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Снимок ассета `expo-image-picker` — только нужные поля. */
export interface PickedAsset {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface GalleryUpload {
  uri: string;
  name: string;
  type: string;
}

/**
 * Ассет → файл загрузки или причина отказа словами. Имя своё: камера отдаёт
 * `ImagePicker-<uuid>.jpg`, а имя человек увидит в отказе сервера.
 */
export function toGalleryUpload(asset: PickedAsset, index: number): GalleryUpload | string {
  const extension = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(asset.uri)?.[1]?.toLowerCase();
  const type = asset.mimeType ?? (extension ? EXTENSION_MIME[extension] : undefined);
  if (!type || !GALLERY_MIME[type]) return 'Фото не подошло: нужен JPEG, PNG или WebP.';
  if ((asset.fileSize ?? 0) > GALLERY_MAX_BYTES) return 'Фото не подошло: больше 20 МБ.';
  return { uri: asset.uri, name: `photo-${index + 1}.${GALLERY_MIME[type]}`, type };
}

/** Переставить снимок на `delta` позиций; за край не уходит. */
export function movePhoto(photos: readonly UserPhotoDto[], id: string, delta: number): UserPhotoDto[] {
  const from = photos.findIndex((photo) => photo.id === id);
  if (from < 0) return [...photos];
  const to = Math.min(photos.length - 1, Math.max(0, from + delta));
  if (to === from) return [...photos];
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Итог загрузки одной строкой: сколько добавилось и что не прошло. */
export function uploadSummary(result: Pick<UserPhotoUploadResponse, 'uploaded' | 'failed'>): string {
  const parts: string[] = [];
  if (result.uploaded.length > 0) {
    const hidden = result.uploaded.filter((item) => !item.photo.isPublic).length;
    parts.push(
      hidden > 0
        ? `Фото загружено, но скрыто от Знакомств — откройте его кнопкой «Показывать».`
        : 'Фото загружено и уже видно в Знакомствах.',
    );
  }
  for (const failed of result.failed) parts.push(`${failed.fileName}: ${failed.message}`);
  return parts.join(' ');
}

/** Занятое место: «3,2 МБ из 50 МБ». */
export function quotaLine(usedBytes: number, quotaBytes: number): string {
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
  return `${mb(usedBytes)} МБ из ${mb(quotaBytes)} МБ`;
}

// ---- место жительства --------------------------------------------------

/** Искать город — когда и страна, и город набраны хотя бы на две буквы. */
export function canSearchCity(city: string, country: string): boolean {
  return city.trim().length >= 2 && country.trim().length >= 2;
}

/** Уточнение под названием города: область и район, без повтора города и страны. */
export function locationDetails(item: GeoSearchResult): string {
  const excluded = new Set(
    [item.city, item.country].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase()),
  );
  return (item.displayName ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !excluded.has(part.toLowerCase()))
    .join(', ');
}

/** Что уходит в профиль: страна из подсказки, а если её нет — набранная. */
export function toHomeLocation(item: GeoSearchResult, typedCountry: string): GeoSearchResult {
  return { ...item, country: item.country ?? typedCountry.trim() };
}
