import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { MotivationQuizDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { quoteOf } from './explanation-text';
import { READER_VISIBLE_POSTS } from './reader-visible';
import { buildQuiz, quizCandidate, quizSeed, QUIZ_ROUND } from './quiz';

/**
 * Больше иллюстраций за раз не читаем: раунд — десять вопросов, а неверные
 * варианты добираются и без всего пула. Свежие — первыми.
 */
const QUIZ_POOL_LIMIT = 1000;

/**
 * Викторина «какой стих на картинке» (VED-243). Вопросы — опубликованные
 * иллюстрации к Бхагавад-гите с читаемым номером стиха; логика выбора и
 * вариантов — в `quiz.ts`.
 */
@Injectable()
export class MotivationQuizService {
  constructor(private readonly prisma: PrismaService) {}

  async round(rawSeed?: string): Promise<MotivationQuizDto> {
    const seed = quizSeed(rawSeed, () => randomBytes(6).toString('base64url'));
    const rows = await this.prisma.motivationPost.findMany({
      where: {
        ...READER_VISIBLE_POSTS,
        // Открытка несёт напечатанный текст, а часто и номер: не угадывание.
        captionInImage: false,
        imageUrl: { not: null },
        OR: [
          { attributionWork: { contains: 'гит', mode: 'insensitive' } },
          { attributionWork: { contains: 'gita', mode: 'insensitive' } },
          { attributionWork: { contains: 'gītā', mode: 'insensitive' } },
          { attributionWork: { contains: 'бг', mode: 'insensitive' } },
          { quote: { vedabaseBookSlug: 'bhagavad-gita' } },
          { quote: { work: { contains: 'гит', mode: 'insensitive' } } },
          { quote: { work: { contains: 'gita', mode: 'insensitive' } } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: QUIZ_POOL_LIMIT,
      select: {
        id: true,
        slug: true,
        imageUrl: true,
        imageThumbUrl: true,
        attributionWork: true,
        attributionLocator: true,
        quote: {
          select: { work: true, locator: true, vedabaseBookSlug: true },
        },
        translations: {
          where: { language: 'ru' },
          select: { title: true, text: true, imageText: true },
        },
      },
    });
    const candidates = rows.flatMap((row) => {
      const t = row.translations[0];
      const found = quizCandidate({
        id: row.id,
        slug: row.slug,
        imageUrl: row.imageUrl,
        imageThumbUrl: row.imageThumbUrl,
        attributionWork: row.attributionWork,
        attributionLocator: row.attributionLocator,
        title: t?.title ?? null,
        // Под ответом — сама шлока, без пояснения: её и иллюстрирует кадр.
        text: t?.imageText?.trim() || quoteOf(t?.text ?? ''),
        quote: row.quote,
      });
      return found ? [found] : [];
    });
    return {
      seed,
      available: candidates.length,
      questions: buildQuiz(candidates, seed, QUIZ_ROUND),
    };
  }
}
