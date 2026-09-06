import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VedabaseContentRepository } from './vedabase-content.repository';

/**
 * Ассистент портала ищет по текстам писаний. Имя события дублируется в
 * каждом сервисе — модули не импортируют друг друга. Поиск тот же, что у
 * читалки; в карточку уходит книга, глава и отрывок стиха.
 */
const VEDABASE_SEARCH = 'assistant.tool.vedabase_search';
const EXCERPT = 320;

@Injectable()
export class VedabaseAssistantListener {
  constructor(
    private readonly repository: VedabaseContentRepository,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(VEDABASE_SEARCH)
  async search(request: AssistantToolRequest): Promise<AssistantToolReply> {
    const query = textArg(request.args.query);
    const limit = Math.min(8, Math.max(1, Number(request.args.limit) || 5));
    if (!query) return { ok: true, items: [] };
    const hits = await this.repository.search(query, limit);
    if (hits.length === 0) return { ok: true, items: [] };
    const books = await this.prisma.vedabaseBook.findMany({
      where: { slug: { in: [...new Set(hits.map((hit) => hit.bookSlug))] } },
      select: { slug: true, title: true },
    });
    const titleBySlug = new Map(books.map((book) => [book.slug, book.title]));
    return {
      ok: true,
      items: hits.map((hit) => ({
        title: hit.title,
        subtitle: titleBySlug.get(hit.bookSlug) ?? hit.bookSlug,
        body: excerpt(hit.text),
        href: `/vedabase/books/${hit.bookSlug}/${hit.chapterSlug}`,
      })),
    };
  }
}

/** Аргумент модели как строка: всё, что не строка, — пусто. */
function textArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat;
}
