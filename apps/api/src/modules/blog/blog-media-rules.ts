import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_IMAGE_MIME_TYPES,
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_MAX_VIDEOS,
  BLOG_VIDEO_MAX_BYTES,
  BLOG_VIDEO_MAX_SECONDS,
  BLOG_VIDEO_MIME_TYPES,
  type BlogMediaKind,
} from '@vedamatch/shared';

/**
 * Что можно приложить к посту блог-ленты (VED-116): фото и ролики.
 *
 * Чистый модуль: решение «принять ли файл» и «сколько роликов уже в посте»
 * покрывается тестом, а сервис вокруг него держит только Prisma и S3.
 * Правила роликов повторяют «Моменты» из Общения, но живут здесь копией —
 * контракт сервисного модуля запрещает импортировать чужой модуль.
 */

const IMAGE_MIME = new Set<string>(BLOG_IMAGE_MIME_TYPES);
const VIDEO_MIME = new Set<string>(BLOG_VIDEO_MIME_TYPES);

export type BlogMediaDenial =
  'unsupported_type' | 'file_too_large' | 'too_many_images' | 'too_many_videos';

export interface BlogMediaCandidate {
  mimetype: string;
  size: number;
}

/** `null` — такой файл к посту не прикладывается вовсе. */
export function blogMediaKindFor(mimetype: string): BlogMediaKind | null {
  if (IMAGE_MIME.has(mimetype)) return 'photo';
  if (VIDEO_MIME.has(mimetype)) return 'video';
  return null;
}

export function maxBlogMediaBytes(kind: BlogMediaKind): number {
  return kind === 'video' ? BLOG_VIDEO_MAX_BYTES : BLOG_IMAGE_MAX_BYTES;
}

/** `null` — файл сам по себе подходит (без учёта соседей по посту). */
export function validateBlogMedia(
  file: BlogMediaCandidate | undefined,
): 'unsupported_type' | 'file_too_large' | null {
  if (!file) return 'unsupported_type';
  const kind = blogMediaKindFor(file.mimetype);
  if (!kind) return 'unsupported_type';
  if (file.size > maxBlogMediaBytes(kind)) return 'file_too_large';
  return null;
}

/**
 * Решение по каждому новому файлу с учётом того, что уже лежит в посте.
 *
 * Один плохой файл не отменяет хороших: отказ получает он один, а соседи
 * едут дальше, — ровно как было у фотографий до роликов. Предел вложений
 * считается по всему посту, роликов — отдельно.
 */
export function planBlogMedia<T extends BlogMediaCandidate>(
  files: T[],
  existing: { total: number; videos: number },
): Array<
  { file: T; kind: BlogMediaKind } | { file: T; denial: BlogMediaDenial }
> {
  let total = existing.total;
  let videos = existing.videos;
  return files.map((file) => {
    const invalid = validateBlogMedia(file);
    if (invalid) return { file, denial: invalid };
    const kind = blogMediaKindFor(file.mimetype) as BlogMediaKind;
    if (total >= BLOG_POST_MAX_IMAGES)
      return { file, denial: 'too_many_images' };
    if (kind === 'video' && videos >= BLOG_POST_MAX_VIDEOS) {
      return { file, denial: 'too_many_videos' };
    }
    total += 1;
    if (kind === 'video') videos += 1;
    return { file, kind };
  });
}

/** Расширение объекта в бакете: по нему ffmpeg и браузер узнают контейнер. */
export function blogVideoExtension(mimetype: string): '.webm' | '.mp4' {
  return mimetype === 'video/webm' ? '.webm' : '.mp4';
}

/** `null` — длительность подходит; иначе код отказа для формы. */
export function blogVideoDurationDenial(
  durationSec: number | null,
): 'video_unreadable' | 'video_too_long' | null {
  if (durationSec === null || durationSec <= 0) return 'video_unreadable';
  if (durationSec > BLOG_VIDEO_MAX_SECONDS) return 'video_too_long';
  return null;
}
