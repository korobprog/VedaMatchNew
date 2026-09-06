import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ассистент портала спрашивает Образование о материалах. Имя события
 * дублируется в каждом сервисе — модули не импортируют друг друга. Поиск —
 * тот же tsvector, что у ленты; когда он пуст, ищем подстрокой по заголовку.
 */
const LIBRARY_SEARCH = 'assistant.tool.library_search';
const EXCERPT = 160;
const TYPES = [
  'article',
  'video',
  'audio',
  'book',
  'course',
  'website',
] as const;
const TYPE_LABEL: Record<string, string> = {
  website: 'сайт',
  article: 'статья',
  video: 'видео',
  audio: 'аудио',
  book: 'книга',
  course: 'курс',
  app: 'приложение',
  telegram_channel: 'телеграм-канал',
  vk_group: 'группа ВК',
  community: 'сообщество',
  other: 'материал',
};

@Injectable()
export class LibraryAssistantListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(LIBRARY_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    const type = TYPES.find((value) => value === request.args.type);
    if (!query) return { ok: true, items: [] };

    const ranked = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT "id"
      FROM "LibraryEntry"
      WHERE "status" = 'published'
        AND "searchVector" @@ (
          plainto_tsquery('russian', ${query}) ||
          plainto_tsquery('english', ${query})
        )
      ORDER BY ts_rank(
        "searchVector",
        plainto_tsquery('russian', ${query}) ||
        plainto_tsquery('english', ${query})
      ) DESC
      LIMIT 40
    `);
    const ids = ranked.map((row) => row.id);
    const where: Prisma.LibraryEntryWhereInput = {
      status: 'published',
      ...(type ? { type } : {}),
      ...(ids.length > 0
        ? { id: { in: ids } }
        : {
            OR: [
              { titleRu: { contains: query, mode: 'insensitive' } },
              { titleEn: { contains: query, mode: 'insensitive' } },
              { ogTitle: { contains: query, mode: 'insensitive' } },
            ],
          }),
    };
    const rows = await this.prisma.libraryEntry.findMany({
      where,
      take: limit,
      orderBy: ids.length > 0 ? undefined : { rankScore: 'desc' },
      select: {
        id: true,
        type: true,
        domain: true,
        titleRu: true,
        titleEn: true,
        ogTitle: true,
        descriptionRu: true,
        descriptionEn: true,
        ogDescription: true,
        previewUrl: true,
      },
    });
    // Порядок релевантности из raw-запроса: findMany с `in` его не хранит.
    const order = new Map(ids.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      ok: true,
      items: rows.map((row) => ({
        title: row.titleRu || row.titleEn || row.ogTitle || 'Материал',
        subtitle: [TYPE_LABEL[row.type] ?? row.type, row.domain]
          .filter(Boolean)
          .join(' · '),
        body: excerpt(
          row.descriptionRu || row.descriptionEn || row.ogDescription,
        ),
        imageUrl: row.previewUrl,
        href: `/library/entry/${row.id}`,
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
