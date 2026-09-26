import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PAGE_BOOKMARK_EVENT, type PageBookmarkEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BookmarksService } from './bookmarks.service';

/**
 * Закладки, поставленные кнопкой внутри сервиса (VED-539): материал
 * Образования, отмеченный на своей карточке, появляется и в общих закладках.
 *
 * Сервис сообщает факт, строку заводит этот раздел — теми же правилами, что и
 * ручную закладку (проверка адреса, лимит, одна строка на страницу). Упавшая
 * закладка здесь не должна ронять нажатие в сервисе, поэтому ошибка только
 * пишется в журнал: отметка в сервисе уже стоит, а в общий список человек
 * может добавить страницу и сам.
 */
@Injectable()
export class BookmarksListener {
  private readonly logger = new Logger(BookmarksListener.name);

  constructor(
    private readonly bookmarks: BookmarksService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(PAGE_BOOKMARK_EVENT, { async: true })
  async onPageBookmark(event: PageBookmarkEvent): Promise<void> {
    try {
      if (event.bookmarked) {
        await this.bookmarks.create(event.userId, {
          path: event.path,
          title: event.title,
        });
        return;
      }
      await this.prisma.bookmarksEntry.deleteMany({
        where: { userId: event.userId, path: event.path },
      });
    } catch (error) {
      this.logger.warn(
        `Закладка ${event.path} не синхронизирована: ${String(error)}`,
      );
    }
  }
}
