import { BadRequestException } from '@nestjs/common';
import {
  BLOG_ALBUM_CAPTION_MAX_LENGTH,
  BLOG_ALBUM_MAX_PHOTOS,
} from '@vedamatch/shared';
import {
  blogMediaKindFor,
  validateBlogMedia,
  type BlogMediaCandidate,
} from './blog-media-rules';

/**
 * Альбом на личной странице (VED-686, часть 3). Чистая логика: подпись и
 * решение «принять ли файл» покрываются тестом без Prisma и S3.
 */

/**
 * Подпись к фото. Строка обязательна — пустая означает «стереть» и
 * превращается в `null`; отсутствие поля — ошибка клиента, а не стирание.
 */
export function parseAlbumCaption(body: unknown): string | null {
  const raw = (body as { caption?: unknown } | null | undefined)?.caption;
  if (typeof raw !== 'string') throw new BadRequestException('caption_invalid');
  const caption = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (caption.length > BLOG_ALBUM_CAPTION_MAX_LENGTH) {
    throw new BadRequestException('caption_too_long');
  }
  return caption === '' ? null : caption;
}

/**
 * Отказ по одному файлу альбома, `null` — файл подходит. Коды те же, что у
 * вложений поста (`unsupported_type`, `file_too_large`); ролики в альбом не
 * берём — `album_photo_only`. `album_full` — не влезли в предел альбома.
 */
export function albumFileDenial(
  file: BlogMediaCandidate,
  existingCount: number,
):
  | 'unsupported_type'
  | 'file_too_large'
  | 'album_photo_only'
  | 'album_full'
  | null {
  const invalid = validateBlogMedia(file);
  if (invalid) return invalid;
  if (blogMediaKindFor(file.mimetype) !== 'photo') return 'album_photo_only';
  if (existingCount >= BLOG_ALBUM_MAX_PHOTOS) return 'album_full';
  return null;
}
