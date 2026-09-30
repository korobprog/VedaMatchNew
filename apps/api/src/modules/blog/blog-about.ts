import { BadRequestException } from '@nestjs/common';
import { BLOG_ABOUT_MAX_LENGTH } from '@vedamatch/shared';

/**
 * «О себе» с личной страницы (VED-686): строка, пробелы по краям и лишние
 * пустые строки (больше одной подряд) срезаются. Пустой результат — `null`,
 * текст стирается.
 */
export function parseBlogAbout(body: unknown): string | null {
  const value =
    body !== null && typeof body === 'object'
      ? (body as { about?: unknown }).about
      : undefined;
  if (typeof value !== 'string') throw new BadRequestException('about_invalid');
  const about = value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (about.length > BLOG_ABOUT_MAX_LENGTH) {
    throw new BadRequestException('about_too_long');
  }
  return about || null;
}
