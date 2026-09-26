import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PAGE_BOOKMARK_EVENT, type PageBookmarkEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Избранное пользователя.
 *
 * Повторное добавление и повторное удаление не считаются ошибкой: кнопка
 * может нажаться дважды, а счётчик на записи должен остаться верным, поэтому
 * трогаем его только когда строка действительно появилась или исчезла.
 *
 * Отмеченное попадает и в общие закладки портала (VED-539): о каждом нажатии
 * уходит событие `PAGE_BOOKMARK_EVENT`, строку там заводит сам раздел
 * закладок. Событие шлём и на повторное нажатие — закладка, поставленная до
 * этой связки, так догоняет общий список.
 */
@Injectable()
export class LibraryBookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async add(userId: string, entryId: string): Promise<void> {
    const entry = await this.ensureEntry(entryId);
    this.emit(userId, entryId, entryTitle(entry), true);
    const existing = await this.prisma.libraryBookmark.findUnique({
      where: { userId_entryId: { userId, entryId } },
      select: { entryId: true },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.libraryBookmark.create({ data: { userId, entryId } });
      await tx.libraryEntry.update({
        where: { id: entryId },
        data: { bookmarkCount: { increment: 1 } },
      });
    });
  }

  async remove(userId: string, entryId: string): Promise<void> {
    this.emit(userId, entryId, '', false);
    const removed = await this.prisma.libraryBookmark.deleteMany({
      where: { userId, entryId },
    });
    if (removed.count === 0) return;
    await this.prisma.libraryEntry.update({
      where: { id: entryId },
      data: { bookmarkCount: { decrement: 1 } },
    });
  }

  /** Идентификаторы записей из списка, которые пользователь отметил. */
  async markedAmong(userId: string, entryIds: string[]): Promise<Set<string>> {
    if (entryIds.length === 0) return new Set();
    const rows = await this.prisma.libraryBookmark.findMany({
      where: { userId, entryId: { in: entryIds } },
      select: { entryId: true },
    });
    return new Set(rows.map((row) => row.entryId));
  }

  /** Записи в избранном, свежие сверху. */
  async entryIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.libraryBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { entryId: true },
    });
    return rows.map((row) => row.entryId);
  }

  private emit(
    userId: string,
    entryId: string,
    title: string,
    bookmarked: boolean,
  ): void {
    const event: PageBookmarkEvent = {
      userId,
      path: `/library/entry/${entryId}`,
      title,
      bookmarked,
    };
    this.events.emit(PAGE_BOOKMARK_EVENT, event);
  }

  private async ensureEntry(entryId: string): Promise<EntryTitle> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id: entryId },
      select: { status: true, titleRu: true, titleEn: true },
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    return entry;
  }
}

type EntryTitle = { titleRu: string | null; titleEn: string | null };

/** Подпись закладки: русское название, иначе английское. */
export function entryTitle(entry: EntryTitle): string {
  return entry.titleRu?.trim() || entry.titleEn?.trim() || 'Материал';
}
