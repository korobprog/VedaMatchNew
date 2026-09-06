import { HttpException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AccessTokenPayload,
  AssistantToolReply,
  AssistantToolRequest,
  MotivationReelCreateInput,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationReelsService } from './motivation-reels.service';

/**
 * Ассистент портала и Вдохновение: поиск цитат и «свой рилс» по просьбе из
 * чата. Имена событий дублируются в каждом сервисе — модули не импортируют
 * друг друга.
 *
 * Рилс создаётся тем же путём, что из мастера: та же ИИ-модерация, тот же
 * дневной лимит, тот же конвейер картинки. Ассистент лишь приносит текст,
 * который человек уже подтвердил кнопкой в чате.
 */
const MOTIVATION_SEARCH = 'assistant.tool.motivation_search';
const MOTIVATION_CREATE_REEL = 'assistant.tool.motivation_create_reel';
const EXCERPT = 220;

@Injectable()
export class MotivationAssistantListener {
  private readonly logger = new Logger(MotivationAssistantListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reels: MotivationReelsService,
  ) {}

  @OnEvent(MOTIVATION_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    if (!query) return { ok: true, items: [] };
    const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.MotivationPostWhereInput = {
      status: 'published',
      AND: words.map((word) => ({
        OR: [
          {
            translations: {
              some: { title: { contains: word, mode: 'insensitive' } },
            },
          },
          {
            translations: {
              some: { text: { contains: word, mode: 'insensitive' } },
            },
          },
          { attributionSpeaker: { contains: word, mode: 'insensitive' } },
          { attributionWork: { contains: word, mode: 'insensitive' } },
          { category: { contains: word, mode: 'insensitive' } },
        ],
      })),
    };
    const rows = await this.prisma.motivationPost.findMany({
      where,
      orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      select: {
        slug: true,
        imageUrl: true,
        attributionSpeaker: true,
        attributionWork: true,
        attributionLocator: true,
        translations: {
          where: { language: request.locale === 'en' ? 'en' : 'ru' },
          select: { title: true, text: true },
          take: 1,
        },
      },
    });
    return {
      ok: true,
      items: rows.map((row) => {
        const translation = row.translations[0];
        return {
          title: translation?.title ?? 'Вдохновение',
          subtitle:
            [
              row.attributionSpeaker,
              row.attributionWork,
              row.attributionLocator,
            ]
              .filter(Boolean)
              .join(', ') || null,
          body: excerpt(translation?.text ?? null),
          imageUrl: row.imageUrl,
          href: `/motivation/posts/${row.slug}`,
        };
      }),
    };
  }

  @OnEvent(MOTIVATION_CREATE_REEL)
  async createReel(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const text = textArg(request.args.text);
    if (!text) return { ok: false, text: 'Пустой текст рилса' };
    const input: MotivationReelCreateInput = {
      source: {
        kind: 'own',
        text,
        author:
          typeof request.args.author === 'string' ? request.args.author : null,
      },
      language: request.locale === 'en' ? 'en' : 'ru',
      audienceTrack:
        request.args.audienceTrack === 'vaishnava' ? 'vaishnava' : 'universal',
      explanation:
        typeof request.args.explanation === 'string'
          ? request.args.explanation
          : null,
    };
    const actor: AccessTokenPayload = {
      sub: request.actor.sub,
      email: request.actor.email,
      role: request.actor.role as AccessTokenPayload['role'],
      adminServices: request.actor.adminServices,
    };
    try {
      const result = await this.reels.create(request.userId, actor, input);
      const href = `/motivation/create?reel=${result.id}`;
      return {
        ok: true,
        href,
        text: stageText(result.stage, result.reason),
        items: [
          {
            title: 'Ваш рилс во Вдохновении',
            subtitle: stageLabel(result.stage),
            body: text,
            href,
          },
        ],
      };
    } catch (error) {
      // Отказ по правилу (лимит, модерация, нет этапа) — не сбой: человек
      // должен увидеть причину словами.
      if (error instanceof HttpException)
        return { ok: false, text: String(error.message) };
      this.logger.warn(
        `Рилс из ассистента не создан: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, text: 'Вдохновение не ответило — попробуйте позже.' };
    }
  }
}

/** Аргумент модели как строка: всё, что не строка, — пусто. */
function textArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'rejected':
      return 'Отклонён модерацией';
    case 'admin_review':
      return 'На проверке у администратора';
    case 'published':
      return 'Опубликован';
    default:
      return 'Готовится: рисуется картинка';
  }
}

function stageText(stage: string, reason: string | null): string {
  if (stage === 'rejected')
    return `Рилс не прошёл модерацию${reason ? `: ${reason}` : ''}. Текст можно поправить и попробовать снова.`;
  if (stage === 'admin_review')
    return 'Рилс создан и ждёт проверки администратора — после неё появится в ленте.';
  return 'Рилс создан: текст принят, сервис рисует картинку. За ходом можно следить по ссылке.';
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat;
}
