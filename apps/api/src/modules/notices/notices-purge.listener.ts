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

/**
 * Объявления автора снесёт каскад от `User`, а их фотографии в S3 — нет.
 * Ключи отдаём порталу до удаления строки: после каскада искать их негде.
 */
@Injectable()
export class NoticesPurgeListener {
  private readonly logger = new Logger(NoticesPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const notices = await this.prisma.notice.findMany({
      where: { authorId: event.userId },
      select: { images: { select: { storageKey: true } } },
    });

    const storageKeys = notices.flatMap((notice) =>
      notice.images.map((image) => image.storageKey),
    );
    if (notices.length > 0) {
      this.logger.log(
        `С пользователем ${event.userId} уходят ${notices.length} объявлений и ${storageKeys.length} картинок`,
      );
    }

    return { storageKeys, counts: { notices: notices.length } };
  }
}
