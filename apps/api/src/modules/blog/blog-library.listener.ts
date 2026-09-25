import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  BlogLinkPostResult,
  LibraryBlogShareRequestedEvent,
} from '@vedamatch/shared';
import { buildBlogLinkPost } from './blog-link-post';
import { BlogService } from './blog.service';

/** Имя события литералом: модули не импортируют друг друга. */
const LIBRARY_BLOG_SHARE_REQUESTED = 'library.entry.blog-share-requested';

/**
 * «В Блог-ленту» в Образовании (VED-490): пост от имени отправителя со
 * ссылкой на материал. Всё нужное едет в событии; таблицы Образования не
 * читаются.
 *
 * Возвращает `BlogLinkPostResult`: издатель зовёт emitAsync и отвечает
 * человеку. Отказ (суточный предел, негодная ссылка) — `ok: false` с кодом,
 * а не исключение: шина не рвётся.
 */
@Injectable()
export class BlogLibraryListener {
  private readonly logger = new Logger(BlogLibraryListener.name);

  constructor(private readonly blog: BlogService) {}

  @OnEvent(LIBRARY_BLOG_SHARE_REQUESTED)
  async onShareRequested(
    event: LibraryBlogShareRequestedEvent,
  ): Promise<BlogLinkPostResult> {
    const input = buildBlogLinkPost(event);
    if (!input) return { ok: false, reason: 'invalid_link' };
    try {
      const postId = await this.blog.createLinked(event.requesterId, input);
      return { ok: true, postId };
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        const reason =
          typeof response === 'object' && response && 'message' in response
            ? String(response.message)
            : error.message;
        return { ok: false, reason };
      }
      this.logger.error(
        `Материал ${event.entryId} не отправлен в ленту: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false, reason: 'blog_unavailable' };
    }
  }
}
