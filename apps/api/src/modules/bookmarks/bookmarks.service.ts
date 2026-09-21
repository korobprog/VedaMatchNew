import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BOOKMARKS_LIMIT,
  type BookmarkDto,
  type BookmarkListResponse,
  type CreateBookmarkRequest,
  type UpdateBookmarkRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BookmarkInputError,
  normalizeBookmarkPath,
  normalizeBookmarkTitle,
  serviceFromBookmarkPath,
} from './bookmark-input';

type BookmarkRow = {
  id: string;
  path: string;
  title: string;
  service: string;
  createdAt: Date;
};

/**
 * Закладки портала (VED-163): любой адрес любого раздела — исполнитель в
 * Музыке, доска в Работе, книга в Образовании.
 *
 * Хранится путь, а не ссылка на сущность чужого сервиса: FK на чужие модели
 * контракт запрещает, да и закладка по смыслу — «эта страница», а не «эта
 * запись». Цена решения честная: удалённая страница оставит закладку, ведущую
 * в 404, и вычистить её может только человек.
 */
@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<BookmarkListResponse> {
    const rows = await this.prisma.bookmarksEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        path: true,
        title: true,
        service: true,
        createdAt: true,
      },
    });
    return { items: rows.map(toDto), limit: BOOKMARKS_LIMIT };
  }

  /**
   * Добавить или переименовать. Повторная закладка на ту же страницу не
   * плодит вторую строку: человек нажал «в закладки» ещё раз, потому что не
   * помнил, что она уже есть, и список из двух одинаковых строк — не ответ.
   */
  async create(
    userId: string,
    body: CreateBookmarkRequest,
  ): Promise<BookmarkDto> {
    const path = this.parsePath(body?.path);
    const title = this.parseTitle(body?.title);
    const existing = await this.prisma.bookmarksEntry.findUnique({
      where: { userId_path: { userId, path } },
      select: { id: true },
    });
    if (!existing) {
      const count = await this.prisma.bookmarksEntry.count({
        where: { userId },
      });
      if (count >= BOOKMARKS_LIMIT) {
        throw new BadRequestException({
          code: 'limit',
          message: `Закладок не больше ${BOOKMARKS_LIMIT}. Удалите лишние.`,
        });
      }
    }
    const row = await this.prisma.bookmarksEntry.upsert({
      where: { userId_path: { userId, path } },
      update: { title },
      create: { userId, path, title, service: serviceFromBookmarkPath(path) },
      select: {
        id: true,
        path: true,
        title: true,
        service: true,
        createdAt: true,
      },
    });
    return toDto(row);
  }

  async rename(
    userId: string,
    id: string,
    body: UpdateBookmarkRequest,
  ): Promise<BookmarkDto> {
    const title = this.parseTitle(body?.title);
    // updateMany, а не update: чужой id обязан быть «не найдено», а не
    // чужой строкой, которую мы отредактировали по дороге.
    const changed = await this.prisma.bookmarksEntry.updateMany({
      where: { id, userId },
      data: { title },
    });
    if (changed.count === 0) throw new NotFoundException('Закладка не найдена');
    const row = await this.prisma.bookmarksEntry.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        path: true,
        title: true,
        service: true,
        createdAt: true,
      },
    });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.bookmarksEntry.deleteMany({
      where: { id, userId },
    });
    if (deleted.count === 0) throw new NotFoundException('Закладка не найдена');
  }

  private parsePath(raw: unknown): string {
    try {
      return normalizeBookmarkPath(raw);
    } catch (error) {
      if (error instanceof BookmarkInputError) {
        throw new BadRequestException({
          code: 'path',
          message: 'Закладка ведёт только на страницу портала.',
        });
      }
      throw error;
    }
  }

  private parseTitle(raw: unknown): string {
    try {
      return normalizeBookmarkTitle(raw);
    } catch (error) {
      if (error instanceof BookmarkInputError) {
        throw new BadRequestException({
          code: 'title',
          message: 'У закладки должно быть название.',
        });
      }
      throw error;
    }
  }
}

function toDto(row: BookmarkRow): BookmarkDto {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    service: row.service,
    createdAt: row.createdAt.toISOString(),
  };
}
