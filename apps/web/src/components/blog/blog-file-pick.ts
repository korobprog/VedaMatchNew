import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_IMAGE_MIME_TYPES,
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_MAX_VIDEOS,
  BLOG_VIDEO_MAX_BYTES,
  BLOG_VIDEO_MIME_TYPES,
} from "@vedamatch/shared";

/**
 * Выбор файлов в форме поста (VED-116): фото и ролик.
 *
 * Те же правила, что проверит сервер, но до отправки: пятидесятимегабайтный
 * ролик, который сервер всё равно отвергнет, не должен уходить по мобильной
 * сети целиком, чтобы вернуться отказом. Сервер при этом проверяет всё сам —
 * здесь только вежливость, а не защита.
 */

/** Что ставить в `accept` у поля выбора файлов. */
export const BLOG_MEDIA_ACCEPT = [
  ...BLOG_IMAGE_MIME_TYPES,
  ...BLOG_VIDEO_MIME_TYPES,
].join(",");

const IMAGE = new Set<string>(BLOG_IMAGE_MIME_TYPES);
const VIDEO = new Set<string>(BLOG_VIDEO_MIME_TYPES);

export function isBlogVideoFile(file: { type: string }): boolean {
  return VIDEO.has(file.type);
}

export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

export interface BlogPickResult<T extends PickedFile> {
  files: T[];
  rejected: Array<{ name: string; reason: string }>;
}

/**
 * Добавить выбранные файлы к уже выбранным. `kept` — вложения, которые уже
 * лежат в посте (при правке): предел считается по всему посту.
 */
export function pickBlogFiles<T extends PickedFile>(
  current: T[],
  incoming: T[],
  kept: { total: number; videos: number } = { total: 0, videos: 0 },
): BlogPickResult<T> {
  const files = [...current];
  const rejected: Array<{ name: string; reason: string }> = [];
  let videos = kept.videos + current.filter(isBlogVideoFile).length;

  for (const file of incoming) {
    const video = VIDEO.has(file.type);
    if (!video && !IMAGE.has(file.type)) {
      rejected.push({ name: file.name, reason: "unsupported_type" });
      continue;
    }
    if (file.size > (video ? BLOG_VIDEO_MAX_BYTES : BLOG_IMAGE_MAX_BYTES)) {
      rejected.push({ name: file.name, reason: "file_too_large" });
      continue;
    }
    if (kept.total + files.length >= BLOG_POST_MAX_IMAGES) {
      rejected.push({ name: file.name, reason: "too_many_images" });
      continue;
    }
    if (video && videos >= BLOG_POST_MAX_VIDEOS) {
      rejected.push({ name: file.name, reason: "too_many_videos" });
      continue;
    }
    if (video) videos += 1;
    files.push(file);
  }

  return { files, rejected };
}
