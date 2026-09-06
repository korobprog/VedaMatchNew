import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCoverUrl } from './music-track-dto';

/**
 * Ассистент портала спрашивает Музыку о записях. Имя события дублируется в
 * каждом сервисе — модули не импортируют друг друга.
 */
const MUSIC_SEARCH = 'assistant.tool.music_search';

@Injectable()
export class MusicAssistantListener {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  @OnEvent(MUSIC_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    if (!query) return { ok: true, items: [] };
    const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.MusicTrackWhereInput = {
      status: 'published',
      AND: words.map((word) => ({
        OR: [
          { title: { contains: word, mode: 'insensitive' } },
          { artist: { name: { contains: word, mode: 'insensitive' } } },
          { album: { title: { contains: word, mode: 'insensitive' } } },
          {
            categories: {
              some: {
                category: { title: { contains: word, mode: 'insensitive' } },
              },
            },
          },
        ],
      })),
    };
    const rows = await this.prisma.musicTrack.findMany({
      where,
      orderBy: [{ playCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        durationSeconds: true,
        coverKey: true,
        artist: { select: { name: true } },
        album: { select: { title: true, coverKey: true } },
      },
    });
    return {
      ok: true,
      items: rows.map((row) => ({
        title: row.title,
        subtitle: [
          row.artist?.name,
          row.album?.title,
          duration(row.durationSeconds),
        ]
          .filter(Boolean)
          .join(' · '),
        imageUrl: buildCoverUrl(
          this.publicBaseUrl,
          row.coverKey ?? row.album?.coverKey ?? null,
        ),
        href: `/music/tracks/${row.id}`,
      })),
    };
  }
}

/** Аргумент модели как строка: всё, что не строка, — пусто. */
function textArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
