import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AdminAuditEvent,
  VedabaseAdminBook,
  VedabaseAdminBookPatch,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const bookSelect = {
  slug: true,
  title: true,
  author: true,
  kind: true,
  audienceStages: true,
  lineages: true,
  blocked: true,
  activeVersionId: true,
  activeVersion: { select: { chapterCount: true } },
} as const;

/**
 * Админка книг Библиотеки (VED-662, часть 3): разметка «для кого» и линий
 * для полки, правка названия и автора, блокировка. Текст книги здесь не
 * меняется — он приходит импортом версии.
 */
@Injectable()
export class VedabaseAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async listBooks(): Promise<VedabaseAdminBook[]> {
    const books = await this.prisma.vedabaseBook.findMany({
      select: bookSelect,
      orderBy: { title: 'asc' },
    });
    return books.map(toAdminBook);
  }

  async updateBook(
    actorId: string,
    slug: string,
    patch: VedabaseAdminBookPatch,
  ): Promise<VedabaseAdminBook> {
    const current = await this.prisma.vedabaseBook.findUnique({
      where: { slug },
      select: { id: true, blocked: true },
    });
    if (!current) throw new NotFoundException('Книга не найдена');
    const updated = await this.prisma.vedabaseBook.update({
      where: { id: current.id },
      data: patch,
      select: bookSelect,
    });
    const event: AdminAuditEvent = {
      actorId,
      action: 'vedabase.book-updated',
      targetType: 'platform',
      targetId: slug,
      details: {
        book: updated.title,
        fields: Object.keys(patch).join(', '),
        ...(patch.blocked !== undefined && patch.blocked !== current.blocked
          ? { blocked: patch.blocked }
          : {}),
      },
    };
    this.events.emit('admin.action', event);
    return toAdminBook(updated);
  }
}

function toAdminBook(book: {
  slug: string;
  title: string;
  author: string | null;
  kind: VedabaseAdminBook['kind'];
  audienceStages: string[];
  lineages: string[];
  blocked: boolean;
  activeVersionId: string | null;
  activeVersion: { chapterCount: number } | null;
}): VedabaseAdminBook {
  return {
    slug: book.slug,
    title: book.title,
    author: book.author,
    kind: book.kind,
    audienceStages: book.audienceStages,
    lineages: book.lineages,
    blocked: book.blocked,
    chapterCount: book.activeVersion?.chapterCount ?? 0,
    active: book.activeVersionId !== null,
  };
}
