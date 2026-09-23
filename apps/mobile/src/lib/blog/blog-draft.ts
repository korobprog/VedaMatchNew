import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_IMAGE_MIME_TYPES,
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_TEXT_MAX_LENGTH,
  BLOG_POST_TITLE_MAX_LENGTH,
} from '@vedamatch/shared';
import { plural } from '@/lib/chat/plural';
import type { UploadSource } from '@/lib/upload/upload-form-part';

/**
 * Черновик поста блог-ленты (VED-334) — проверка до отправки.
 *
 * Зеркало сервера (`apps/api/src/modules/blog/blog-validate.ts`,
 * `blog-images.service.ts`): те же пределы из `@vedamatch/shared` и тот же
 * порядок проверок — первая нарушенная в порядке полей формы. Сервер всё
 * равно проверит сам; здесь — чтобы не гнать десять фотографий по мобильной
 * сети ради отказа, который был известен заранее.
 */

export interface BlogPhoto extends UploadSource {
  /** Ключ в списке превью; uri у двух снимков камеры бывает одинаковым. */
  key: string;
  /** 0 — размер не пришёл от галереи/камеры: решает сервер. */
  sizeBytes: number;
}

export interface BlogDraft {
  title: string;
  text: string;
  photos: BlogPhoto[];
}

export const EMPTY_BLOG_DRAFT: BlogDraft = { title: '', text: '', photos: [] };

export type BlogDraftError = 'post_empty' | 'title_too_long' | 'text_too_long' | 'too_many_images';

/** Заголовок: пустая строка и пробелы — «заголовка нет». Как `normalizeTitle` сервера. */
export function normalizeBlogTitle(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Текст так, как его посчитает сервер (`normalizeText`): переводы строк к
 * `\n`, строка из пробелов — пустая, три и больше переводов подряд — одна
 * пустая строка, края обрезаны.
 */
export function normalizeBlogText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `null` — черновик можно отправлять. */
export function validateBlogDraft(draft: BlogDraft): BlogDraftError | null {
  const title = normalizeBlogTitle(draft.title);
  const text = normalizeBlogText(draft.text);
  // Картинка сама по себе — законный пост картиночной ленты.
  if (title === null && text === '' && draft.photos.length === 0) return 'post_empty';
  if (title !== null && title.length > BLOG_POST_TITLE_MAX_LENGTH) return 'title_too_long';
  if (text.length > BLOG_POST_TEXT_MAX_LENGTH) return 'text_too_long';
  if (draft.photos.length > BLOG_POST_MAX_IMAGES) return 'too_many_images';
  return null;
}

/** Сколько фотографий ещё можно добавить — для `selectionLimit` галереи. */
export function remainingPhotoSlots(draft: Pick<BlogDraft, 'photos'>): number {
  return Math.max(0, BLOG_POST_MAX_IMAGES - draft.photos.length);
}

/**
 * Добавить выбранные фотографии. Лишние сверх предела не добавляются, и об
 * этом говорится словами: молча выброшенная фотография — та, которую человек
 * потом ищет в ленте.
 */
export function addBlogPhotos(
  draft: BlogDraft,
  photos: readonly BlogPhoto[],
): { draft: BlogDraft; dropped: number } {
  const slots = remainingPhotoSlots(draft);
  const taken = photos.slice(0, slots);
  return { draft: { ...draft, photos: [...draft.photos, ...taken] }, dropped: photos.length - taken.length };
}

export function removeBlogPhoto(draft: BlogDraft, key: string): BlogDraft {
  return { ...draft, photos: draft.photos.filter((photo) => photo.key !== key) };
}

// ---- фотографии --------------------------------------------------------

const ALLOWED_MIME = new Set<string>(BLOG_IMAGE_MIME_TYPES);

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Расширение → MIME, когда галерея его не сообщила. Неподходящие тоже узнаём — ради точного отказа. */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export type BlogPhotoDenial = 'unsupported_type' | 'file_too_large' | 'unknown_type';

/** Снимок ассета `expo-image-picker` — только нужные поля. */
export interface PickedBlogAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

function inferMime(uri: string): string | null {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  return extension ? (EXTENSION_MIME[extension] ?? null) : null;
}

/**
 * Ассет галереи/камеры → фотография черновика, или причина отказа.
 *
 * Сервер принимает только JPEG, PNG и WebP до 10 МБ (`BLOG_IMAGE_*`), и GIF
 * здесь, в отличие от вложений переписки, не проходит. Имя своё, а не из
 * ассета: камера отдаёт `ImagePicker-<uuid>.jpg`, а имя видно человеку в
 * отказе сервера («photo-3.jpg: файл слишком большой»).
 */
export function normalizeBlogPhoto(
  asset: PickedBlogAsset,
  index: number,
  seed: number = Date.now(),
): BlogPhoto | BlogPhotoDenial {
  const type = asset.mimeType ?? inferMime(asset.uri);
  if (!type) return 'unknown_type';
  if (!ALLOWED_MIME.has(type)) return 'unsupported_type';
  const sizeBytes = asset.fileSize ?? 0;
  if (sizeBytes > BLOG_IMAGE_MAX_BYTES) return 'file_too_large';
  const name = `photo-${index + 1}.${MIME_EXTENSION[type]}`;
  return { uri: asset.uri, name, type, sizeBytes, key: `${seed}-${index}-${asset.uri}` };
}

export function blogPhotoDenialMessage(denial: BlogPhotoDenial, count = 1): string {
  const lead = count > 1 ? `${count} ${plural(count, 'фотография не подошла', 'фотографии не подошли', 'фотографий не подошли')}` : 'Фотография не подошла';
  if (denial === 'file_too_large') return `${lead}: больше 10 МБ.`;
  if (denial === 'unknown_type') return `${lead}: не удалось определить тип файла.`;
  return `${lead}: нужен JPEG, PNG или WebP.`;
}

/**
 * Разобрать выбор галереи или камеры: годные — в черновик, отказы — одной
 * фразой по первой причине. Номера имён продолжают уже добавленные фото.
 */
export function takeBlogAssets(
  assets: readonly PickedBlogAsset[],
  offset: number,
  seed: number = Date.now(),
): { photos: BlogPhoto[]; denial: string | null } {
  const photos: BlogPhoto[] = [];
  const denials: BlogPhotoDenial[] = [];
  assets.forEach((asset, index) => {
    const result = normalizeBlogPhoto(asset, offset + index, seed);
    if (typeof result === 'string') denials.push(result);
    else photos.push(result);
  });
  return { photos, denial: denials.length > 0 ? blogPhotoDenialMessage(denials[0], denials.length) : null };
}

// ---- счётчик текста ----------------------------------------------------

export type BlogTextTone = 'quiet' | 'warn' | 'over';

/** С этого остатка подпись становится предупреждением — как на сайте. */
export const BLOG_TEXT_WARN_AT = 1000;

/**
 * Подпись под полем текста. Вместо `maxLength`: тот молча обрезает
 * вставленный длинный текст с конца, и человек не видит, что часть не
 * доехала (VED-371). Здесь поле принимает всё, а отправка блокируется, пока
 * текст не влезает.
 */
export function blogTextCounter(value: string, max: number = BLOG_POST_TEXT_MAX_LENGTH): { label: string; tone: BlogTextTone } {
  const used = normalizeBlogText(value).length;
  const over = used - max;
  if (over > 0) {
    return {
      label: `${plural(over, 'Лишний', 'Лишних', 'Лишних')} ${over} ${plural(over, 'знак', 'знака', 'знаков')} — столько нужно убрать.`,
      tone: 'over',
    };
  }
  const remaining = max - used;
  if (remaining <= BLOG_TEXT_WARN_AT) {
    return { label: `Осталось ${remaining} ${plural(remaining, 'знак', 'знака', 'знаков')}.`, tone: 'warn' };
  }
  return { label: `${used} из ${max}`, tone: 'quiet' };
}

/** Поля запроса публикации — уже нормализованные, как их сохранит сервер. */
export function blogDraftFields(draft: BlogDraft): { title: string | null; text: string } {
  return { title: normalizeBlogTitle(draft.title), text: normalizeBlogText(draft.text) };
}
