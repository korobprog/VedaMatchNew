import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCityKey } from '../../common/city-key';

/**
 * Ассистент портала спрашивает доску Объявлений. Имя события дублируется в
 * каждом сервисе — модули не импортируют друг друга. Отдаются только живые
 * объявления и без точных координат: наружу уходят город и рубрика.
 */
const NOTICES_SEARCH = 'assistant.tool.notices_search';
const EXCERPT = 160;
const KINDS = ['offer', 'request', 'event', 'info'] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  offer: 'отдам',
  request: 'нужна помощь',
  event: 'событие',
  info: 'информация',
};

@Injectable()
export class NoticesAssistantListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(NOTICES_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    const kind = KINDS.find((value) => value === request.args.kind);
    const city =
      typeof request.args.city === 'string' && request.args.city.trim()
        ? normalizeCityKey(request.args.city)
        : undefined;
    if (!query) return { ok: true, items: [] };

    const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.NoticeWhereInput = {
      status: 'published',
      expiresAt: { gt: new Date() },
      ...(kind ? { kind } : {}),
      ...(city ? { cityKey: city } : {}),
      AND: words.map((word) => ({
        OR: [
          { titleRu: { contains: word, mode: 'insensitive' } },
          { titleEn: { contains: word, mode: 'insensitive' } },
          { descriptionRu: { contains: word, mode: 'insensitive' } },
          { descriptionEn: { contains: word, mode: 'insensitive' } },
          { rubric: { nameRu: { contains: word, mode: 'insensitive' } } },
        ],
      })),
    };
    const rows = await this.prisma.notice.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        titleRu: true,
        titleEn: true,
        descriptionRu: true,
        descriptionEn: true,
        city: true,
        startsAt: true,
        primaryImageUrl: true,
        rubric: { select: { nameRu: true } },
      },
    });
    return {
      ok: true,
      items: rows.map((row) => ({
        title: row.titleRu || row.titleEn || row.rubric.nameRu,
        subtitle: [
          KIND_LABEL[row.kind],
          row.rubric.nameRu,
          row.city,
          row.startsAt ? row.startsAt.toISOString().slice(0, 10) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        body: excerpt(row.descriptionRu || row.descriptionEn),
        imageUrl: row.primaryImageUrl,
        href: `/notices/${row.id}`,
      })),
    };
  }
}

/** Аргумент модели как строка: всё, что не строка, — пусто. */
function textArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat;
}
