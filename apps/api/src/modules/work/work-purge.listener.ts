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
 * Что уходит вместе с человеком: его среды (каскадом от `WorkSpace.ownerId`) и
 * вложения их задач в S3. Каскад Postgres до бакета не достаёт, поэтому ключи
 * собираются до удаления строки — после него искать их негде.
 *
 * Задачи и комментарии в чужих средах не трогаем: у них `SetNull`, работа
 * команды не должна осыпаться из-за ухода одного участника.
 */
@Injectable()
export class WorkPurgeListener {
  private readonly logger = new Logger(WorkPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const spaces = await this.prisma.workSpace.findMany({
      where: { ownerId: event.userId },
      select: { id: true },
    });
    const spaceIds = spaces.map((space) => space.id);

    const attachments = spaceIds.length
      ? await this.prisma.workAttachment.findMany({
          where: { task: { spaceId: { in: spaceIds } } },
          select: { storageKey: true },
        })
      : [];

    if (spaces.length > 0) {
      this.logger.log(
        `С пользователем ${event.userId} уходят ${spaces.length} рабочих сред и ${attachments.length} вложений`,
      );
    }

    return {
      storageKeys: attachments.map((file) => file.storageKey),
      counts: { workSpaces: spaces.length },
    };
  }
}
