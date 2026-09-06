import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { orphanStorageKeys } from './chat-purge';

/**
 * Портал просит сервисы отдать ключи объектов удаляемого аккаунта.
 * Имя события дублируется в каждом сервисе — модули не импортируют друг друга.
 */
const USER_PURGE_REQUESTED = 'portal.user.purge-requested';

interface UserPurgeRequested {
  userId: string;
}

/**
 * Сообщения человека снесёт каскад от `User`, а фотографии, файлы и голосовые
 * в S3 каскадом не удаляются: ключи надо собрать до удаления строки — после
 * каскада искать их будет негде.
 *
 * Картинки групп и каналов (`ChatConversation.avatarKey`) сюда не попадают
 * намеренно: беседа переживает уход своего создателя и продолжает показывать
 * эту картинку остальным участникам.
 *
 * Фотографии моментов собираются здесь же, а не отдельным слушателем: на
 * модуль он один, и вычитать пересылки из двух списков разом проще, чем
 * согласовывать два ответа порталу.
 */
@Injectable()
export class ChatPurgeListener {
  private readonly logger = new Logger(ChatPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const [mine, moments] = await Promise.all([
      this.prisma.chatAttachment.findMany({
        where: { message: { authorId: event.userId } },
        select: { key: true },
      }),
      // Моменты уходят каскадом от `User`, а их фотографии в бакете — нет.
      this.prisma.chatMoment.findMany({
        where: { authorId: event.userId },
        select: { key: true },
      }),
    ]);
    const keys = [...mine, ...moments]
      .map((row) => row.key)
      .filter((key): key is string => Boolean(key));

    // Те же ключи в чужих сообщениях — следы пересылки: объект в бакете один,
    // и он всё ещё нужен тому, кому переслали.
    const survivors = keys.length
      ? await this.prisma.chatAttachment.findMany({
          where: {
            key: { in: keys },
            message: { authorId: { not: event.userId } },
          },
          select: { key: true },
        })
      : [];

    const storageKeys = orphanStorageKeys(
      keys,
      survivors.map((attachment) => attachment.key),
    );
    const messages = await this.prisma.chatMessage.count({
      where: { authorId: event.userId },
    });

    if (messages > 0 || moments.length > 0) {
      this.logger.log(
        `С пользователем ${event.userId} уходят ${messages} сообщений, ${moments.length} моментов и ${storageKeys.length} файлов` +
          (keys.length > storageKeys.length
            ? `; ${keys.length - storageKeys.length} оставлены — их переслали другим`
            : ''),
      );
    }

    return {
      storageKeys,
      counts: { chatMessages: messages, chatMoments: moments.length },
    };
  }
}
