import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AppReleasePublishedEvent,
  ChangelogAnnouncementPublishedEvent,
  ChangelogAnnouncementWithdrawnEvent,
} from '@vedamatch/shared';
import { ChatOfficialPostsService } from './chat-official-posts.service';

/**
 * Имена событий литералами: модули не импортируют друг друга, а значения из
 * @vedamatch/shared на сервер не вывозятся. Издатели — changelog (новости
 * из админки) и notifications (выход версии приложения с сайта).
 */
const ANNOUNCEMENT_PUBLISHED = 'changelog.announcement.published';
const ANNOUNCEMENT_WITHDRAWN = 'changelog.announcement.withdrawn';
const APP_RELEASE_PUBLISHED = 'app.release.published';

/**
 * Официальный канал VedaMatch слушает новости портала. Всё нужное едет в
 * событиях, таблицы издателей не читаются; текст поста собирает
 * `official-post-text.ts`, публикует воркер очереди.
 */
@Injectable()
export class ChatOfficialNewsListener {
  private readonly logger = new Logger(ChatOfficialNewsListener.name);

  constructor(private readonly posts: ChatOfficialPostsService) {}

  @OnEvent(ANNOUNCEMENT_PUBLISHED)
  async onAnnouncementPublished(
    event: ChangelogAnnouncementPublishedEvent,
  ): Promise<void> {
    try {
      await this.posts.acceptAnnouncement(event);
    } catch (error) {
      // Сохранение новости в админке от канала страдать не должно.
      this.logger.warn(
        `Новость ${event.announcementId} не поставлена в канал: ${messageOf(error)}`,
      );
    }
  }

  @OnEvent(ANNOUNCEMENT_WITHDRAWN)
  async onAnnouncementWithdrawn(
    event: ChangelogAnnouncementWithdrawnEvent,
  ): Promise<void> {
    try {
      await this.posts.withdrawAnnouncement(event);
    } catch (error) {
      this.logger.warn(
        `Пост новости ${event.announcementId} не снят: ${messageOf(error)}`,
      );
    }
  }

  /** Отвечает издателю: `false` — не вышло, он повторит. */
  @OnEvent(APP_RELEASE_PUBLISHED)
  onAppReleasePublished(event: AppReleasePublishedEvent): Promise<boolean> {
    return this.posts.acceptAppRelease(event);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
