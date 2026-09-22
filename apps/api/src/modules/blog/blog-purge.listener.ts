import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Портал просит сервисы отдать ключи объектов удаляемого аккаунта.
 * Имя события дублируется в каждом сервисе — модули не импортируют друг друга.
 */
const USER_PURGE_REQUESTED = 'portal.user.purge-requested';

interface UserPurgeRequested {
  userId: string;
}

@Injectable()
export class BlogPurgeListener {
  private readonly logger = new Logger(BlogPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const posts = await this.prisma.blogPost.findMany({
      where: { authorId: event.userId },
      select: { images: { select: { storageKey: true } } },
    });

    const storageKeys = posts.flatMap((post) =>
      post.images.map((image) => image.storageKey),
    );
    if (posts.length > 0) {
      this.logger.log(
        `С пользователем ${event.userId} уходят ${posts.length} постов блога и ${storageKeys.length} картинок`,
      );
    }

    return { storageKeys, counts: { blogPosts: posts.length } };
  }
}
