import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  SaveVedabaseColoringRequest,
  VedabaseColorBlock,
  VedabaseColoringDto,
  VedabaseColorSpan,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Цветной перевод (VED-683): раскраску блоков стиха пишет админ, читают все
 * вошедшие. Заблокированная книга раскраски не отдаёт — как и глав.
 */
@Injectable()
export class VedabaseColoringService {
  constructor(private readonly prisma: PrismaService) {}

  async forChapter(
    bookSlug: string,
    chapterSlug: string,
  ): Promise<VedabaseColoringDto[]> {
    const rows = await this.prisma.vedabaseColoring.findMany({
      where: { chapterSlug, book: { slug: bookSlug, blocked: false } },
      select: { unitId: true, block: true, spans: true },
    });
    return rows.map((row) => ({
      unitId: row.unitId,
      block: row.block as VedabaseColorBlock,
      spans: row.spans as unknown as VedabaseColorSpan[],
    }));
  }

  /** Сохранить раскраску блока; пустой список отрезков её снимает. */
  async save(
    actorId: string,
    bookSlug: string,
    input: SaveVedabaseColoringRequest,
  ): Promise<VedabaseColoringDto> {
    const book = await this.prisma.vedabaseBook.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException('book_not_found');
    const key = {
      bookId: book.id,
      chapterSlug: input.chapterSlug,
      unitId: input.unitId,
      block: input.block,
    };
    if (input.spans.length === 0) {
      await this.prisma.vedabaseColoring.deleteMany({ where: key });
    } else {
      const spans = input.spans as unknown as Prisma.InputJsonValue;
      await this.prisma.vedabaseColoring.upsert({
        where: { bookId_chapterSlug_unitId_block: key },
        create: { ...key, spans, updatedById: actorId },
        update: { spans, updatedById: actorId },
      });
    }
    return { unitId: input.unitId, block: input.block, spans: input.spans };
  }
}
