import { Injectable, NotFoundException } from '@nestjs/common';
import type { LibraryEntryLikeResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * «Нравится» у материала (VED-549) — так же, как у постов Блог-ленты
 * (VED-505): своя отметка у каждого и денормализованный счётчик на записи.
 *
 * Идемпотентно в обе стороны: двойное нажатие на медленной сети не должно
 * отвечать ошибкой. Счётчик трогаем только когда строка действительно
 * появилась или исчезла, и в той же транзакции, что и саму строку.
 */
@Injectable()
export class LibraryLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async setLike(
    userId: string,
    entryId: string,
    liked: boolean,
  ): Promise<LibraryEntryLikeResponse> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id: entryId },
      select: { status: true },
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }

    const likeCount = await this.prisma.$transaction(async (tx) => {
      if (liked) {
        const created = await tx.libraryEntryLike.createMany({
          data: [{ userId, entryId }],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          const row = await tx.libraryEntry.update({
            where: { id: entryId },
            data: { likeCount: { increment: 1 } },
            select: { likeCount: true },
          });
          return row.likeCount;
        }
      } else {
        const removed = await tx.libraryEntryLike.deleteMany({
          where: { userId, entryId },
        });
        if (removed.count > 0) {
          const row = await tx.libraryEntry.update({
            where: { id: entryId },
            data: { likeCount: { decrement: 1 } },
            select: { likeCount: true },
          });
          return Math.max(0, row.likeCount);
        }
      }
      const row = await tx.libraryEntry.findUniqueOrThrow({
        where: { id: entryId },
        select: { likeCount: true },
      });
      return row.likeCount;
    });
    return { liked, likeCount };
  }

  /** Отметил ли пользователь материал «Нравится». */
  async isLiked(userId: string, entryId: string): Promise<boolean> {
    const row = await this.prisma.libraryEntryLike.findUnique({
      where: { userId_entryId: { userId, entryId } },
      select: { entryId: true },
    });
    return row !== null;
  }
}
