import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  resolveDisplayName,
  type ChatMessageDto,
  type ChatThreadState,
  type NotificationEvent,
  type PortalActivityEvent,
  type SendChatMessageRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  canDeleteMessage,
  canEditMessage,
  denyWrite,
  type WriteDenial,
} from './chat-access';
import { ChatConversationsService } from './chat-conversations.service';
import {
  toMessageDto,
  toReactionSummaries,
  type ChatConversationRow,
  type ChatMessageRow,
} from './chat-dto';
import { ChatEventsService } from './chat-events.service';
import { ChatPresenceService } from './chat-presence.service';
import { ChatUploadsService } from './chat-uploads.service';
import { chatMessageInclude } from './chat-selects';
import {
  assertReactionEmoji,
  assertSendable,
  ChatValidationError,
  normalizeAttachments,
  normalizeMessageBody,
} from './chat-validate';

/** Объяснения отказа в записи — человеку, а не в логи. */
const WRITE_DENIAL_TEXT: Record<WriteDenial, string> = {
  not_member: 'Беседа недоступна',
  left: 'Вы вышли из этой беседы',
  // Та же формулировка, что при заведении диалога с заблокированным: по
  // отказу не должно быть видно, кто кого заблокировал и было ли это вообще.
  blocked: 'Переписка недоступна',
  declined: 'Человек отклонил переписку',
  archived: 'Беседа в архиве',
  request_awaiting_answer: 'Запрос даёт одно сообщение — дождитесь ответа',
  request_not_yours: 'Сначала примите запрос',
  channel_readers_do_not_write: 'В канал пишет администрация общины',
};

@Injectable()
export class ChatMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly events: ChatEventsService,
    private readonly bus: EventEmitter2,
    private readonly presence: ChatPresenceService,
    private readonly uploads: ChatUploadsService,
  ) {}

  async send(
    userId: string,
    conversationId: string,
    dto: SendChatMessageRequest,
    /**
     * Беседа, чьей папке в бакете обязан принадлежать ключ вложения. Не
     * равна `conversationId`, только когда сообщение пересылает `forward()`:
     * вложение там уже загружено в `source.conversationId` и переезжает
     * копией ссылки, а не файла, — доступ к исходной беседе `forward()`
     * проверяет сам до вызова. Обычная отправка параметр не передаёт, и
     * тогда вложение обязано быть из той же беседы, куда летит сообщение.
     */
    attachmentsConversationId: string = conversationId,
  ): Promise<ChatMessageDto> {
    const conversation = await this.conversations.requireConversation(
      conversationId,
      userId,
    );

    const body = this.validated(() => normalizeMessageBody(dto.body));
    const attachments = this.validated(() =>
      normalizeAttachments(
        dto.attachments,
        this.uploads.storagePrefix,
        attachmentsConversationId,
      ),
    );
    this.validated(() => assertSendable(body, attachments));

    const mine = conversation.members.find((m) => m.userId === userId);
    const messageCount =
      conversation.state === 'request'
        ? await this.prisma.chatMessage.count({ where: { conversationId } })
        : undefined;
    const denial = denyWrite(
      {
        kind: conversation.kind,
        state: conversation.state,
        requestedById: conversation.requestedById,
        messageCount,
        blocked: await this.blockedWithCompanion(userId, conversation),
        // Ответ на пост канала — комментарий: читателю он разрешён, хотя
        // писать в саму ленту он не может.
        isComment: Boolean(dto.replyToId),
      },
      mine
        ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
        : null,
    );
    if (denial) throw new ForbiddenException(WRITE_DENIAL_TEXT[denial]);

    // Цитата обязана быть из этой же беседы: иначе ответом можно вытащить
    // кусок чужой переписки в свою.
    if (dto.replyToId) {
      const original = await this.prisma.chatMessage.findFirst({
        where: { id: dto.replyToId, conversationId },
        select: { id: true },
      });
      if (!original) throw new BadRequestException('Сообщение не найдено');
    }

    const created = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        authorId: userId,
        body,
        replyToId: dto.replyToId ?? null,
        attachments: {
          create: attachments.map((item, index) => ({
            kind: item.kind,
            url: item.url ?? null,
            key: item.key ?? null,
            previewUrl: item.previewUrl ?? null,
            title: item.title ?? null,
            subtitle: item.subtitle ?? null,
            body: item.body ?? null,
            sourceService: item.sourceService ?? null,
            sourceId: item.sourceId ?? null,
            mimeType: item.mimeType ?? null,
            sizeBytes: item.sizeBytes ?? null,
            durationSec: item.durationSec ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
            waveform: item.waveform ?? [],
            position: index,
          })),
        },
      },
      include: chatMessageInclude,
    });

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    });
    // Своё сообщение прочитано по определению: без этого счётчик
    // непрочитанного у отправителя растёт от собственных слов.
    await this.prisma.chatMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: created.createdAt },
    });

    const dtoOut = toMessageDto(created, userId);
    this.events.publish(this.conversations.recipients(conversation), {
      type: 'message.created',
      conversationId,
      message: dtoOut,
    });
    void this.notify(conversation, userId, body || 'Вложение', conversationId);
    this.announceActivity(userId);

    return dtoOut;
  }

  /**
   * Блокировка между собеседниками личного диалога — в любую сторону.
   *
   * Запрос на каждую отправку и только для диалога: в группе и канале
   * блокировка не закрывает беседу, там людей больше двоих, и уйти от одного
   * человека можно выходом. `UserBlock` — портальная модель, читать её модулю
   * разрешено.
   */
  private async blockedWithCompanion(
    userId: string,
    conversation: ChatConversationRow,
  ): Promise<boolean> {
    if (conversation.kind !== 'direct') return false;
    const companion = conversation.members.find((m) => m.userId !== userId);
    if (!companion) return false;

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: companion.userId },
          { blockerId: companion.userId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  /**
   * Факт «человек написал сообщение» для подписчиков портала. Отдельно от
   * уведомления: то адресовано получателю (`recipientId`), а здесь важен
   * автор. Событие самодостаточно — текст переписки в него не попадает.
   */
  private announceActivity(userId: string): void {
    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.chat,
      userId,
      action: 'chat.message-sent',
      occurredAt: new Date().toISOString(),
    };
    this.bus.emit(event.name, event);
  }

  /**
   * Переслать сообщение в другую беседу. Копией, а не ссылкой: получатель
   * может не состоять в исходной беседе, и «открыть оригинал» ему всё равно
   * будет некуда. Имя автора уезжает подписью-снимком.
   */
  async forward(
    userId: string,
    messageId: string,
    targetConversationId: string,
  ): Promise<ChatMessageDto> {
    const source = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: chatMessageInclude,
    });
    if (!source || source.deletedAt)
      throw new NotFoundException('Сообщение не найдено');

    // Прочитать исходную беседу человек обязан: иначе пересылка становится
    // способом вытащить чужую переписку по одному идентификатору.
    await this.conversations.requireConversation(source.conversationId, userId);

    const dtoOut = await this.send(
      userId,
      targetConversationId,
      {
        body: source.body,
        attachments: source.attachments.map((attachment) => ({
          kind: attachment.kind,
          url: attachment.url ?? undefined,
          key: attachment.key ?? undefined,
          previewUrl: attachment.previewUrl ?? undefined,
          title: attachment.title ?? undefined,
          subtitle: attachment.subtitle ?? undefined,
          body: attachment.body ?? undefined,
          sourceService: attachment.sourceService ?? undefined,
          sourceId: attachment.sourceId ?? undefined,
          mimeType: attachment.mimeType ?? undefined,
          sizeBytes: attachment.sizeBytes ?? undefined,
          durationSec: attachment.durationSec ?? undefined,
          width: attachment.width ?? undefined,
          height: attachment.height ?? undefined,
          waveform: attachment.waveform ?? [],
        })),
      },
      // Вложения физически лежат в бакетной папке исходной беседы: файл при
      // пересылке не копируется, копируется только ссылка на него.
      source.conversationId,
    );

    const forwardedFrom = resolveDisplayName(source.author);
    const updated = await this.prisma.chatMessage.update({
      where: { id: dtoOut.id },
      data: { forwardedFrom },
      include: chatMessageInclude,
    });

    return toMessageDto(updated, userId);
  }

  async edit(userId: string, messageId: string, body: string) {
    const message = await this.requireMessage(messageId, userId);
    const conversation = await this.conversations.requireConversation(
      message.conversationId,
      userId,
    );
    const mine = conversation.members.find((m) => m.userId === userId);
    if (!canEditMessage(message.authorId, mine ?? null))
      throw new ForbiddenException('Править можно только своё сообщение');
    if (message.deletedAt) throw new BadRequestException('Сообщение удалено');

    const text = this.validated(() => normalizeMessageBody(body));
    if (!text) throw new BadRequestException('Сообщение пустое');

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: text, editedAt: new Date() },
      include: chatMessageInclude,
    });

    const dtoOut = toMessageDto(updated, userId);
    this.events.publish(this.conversations.recipients(conversation), {
      type: 'message.updated',
      conversationId: message.conversationId,
      message: dtoOut,
    });
    return dtoOut;
  }

  async remove(userId: string, messageId: string) {
    const message = await this.requireMessage(messageId, userId);
    const conversation = await this.conversations.requireConversation(
      message.conversationId,
      userId,
    );
    const mine = conversation.members.find((m) => m.userId === userId);
    if (
      !canDeleteMessage(
        message.authorId,
        { kind: conversation.kind, state: conversation.state },
        mine ?? null,
      )
    )
      throw new ForbiddenException('Удалять можно только своё сообщение');

    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    this.events.publish(this.conversations.recipients(conversation), {
      type: 'message.deleted',
      conversationId: message.conversationId,
      messageId,
    });
    return { ok: true };
  }

  /**
   * Реакция. Тот же эмодзи снимает реакцию, другой — заменяет: одна на
   * человека, как было в чате Знакомств.
   */
  async setReaction(userId: string, messageId: string, emoji: string) {
    this.validated(() => assertReactionEmoji(emoji));
    const message = await this.requireMessage(messageId, userId);
    const conversation = await this.conversations.requireConversation(
      message.conversationId,
      userId,
    );
    // Реакция — тот же способ дотянуться до человека, что и сообщение:
    // без этой проверки заблокированный продолжал ставить эмодзи в диалоге,
    // куда писать ему уже нельзя.
    if (await this.blockedWithCompanion(userId, conversation))
      throw new ForbiddenException(WRITE_DENIAL_TEXT.blocked);

    const existing = await this.prisma.chatMessageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });
    if (existing?.emoji === emoji) {
      await this.prisma.chatMessageReaction.delete({
        where: { id: existing.id },
      });
    } else if (existing) {
      await this.prisma.chatMessageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
    } else {
      await this.prisma.chatMessageReaction.create({
        data: { messageId, userId, emoji },
      });
    }

    const rows = await this.prisma.chatMessageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });

    // В потоке каждый должен увидеть свою пометку «моя реакция», поэтому
    // сводка собирается на каждого получателя отдельно.
    for (const recipientId of this.conversations.recipients(conversation))
      this.events.publish([recipientId], {
        type: 'reaction.set',
        conversationId: message.conversationId,
        messageId,
        reactions: toReactionSummaries(rows, recipientId),
      });

    return { reactions: toReactionSummaries(rows, userId) };
  }

  /**
   * Пост канала со своими комментариями. Отдельная ветка, а не общая лента:
   * в канале обсуждение живёт под постом, иначе десять комментариев к
   * старому объявлению вытесняют новое.
   */
  async thread(userId: string, messageId: string): Promise<ChatThreadState> {
    const post = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: chatMessageInclude,
    });
    if (!post) throw new NotFoundException('Сообщение не найдено');

    const conversation = await this.conversations.requireConversation(
      post.conversationId,
      userId,
    );
    const mine = conversation.members.find((m) => m.userId === userId);

    const comments = await this.prisma.chatMessage.findMany({
      where: { replyToId: messageId },
      include: chatMessageInclude,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return {
      post: toMessageDto(post, userId),
      comments: comments.map((row) =>
        toMessageDto(row as ChatMessageRow, userId),
      ),
      canComment: !denyWrite(
        {
          kind: conversation.kind,
          state: conversation.state,
          requestedById: conversation.requestedById,
          isComment: true,
        },
        mine
          ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
          : null,
      ),
    };
  }

  /**
   * Отметить посты просмотренными. Строка на человека: без неё один и тот же
   * читатель накручивал бы счётчик каждым открытием ленты.
   */
  async markViewed(userId: string, messageIds: string[]) {
    const ids = [...new Set(messageIds)].slice(0, 50);
    if (ids.length === 0) return { counted: 0 };

    // Считаем только то, что человек вправе видеть.
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        id: { in: ids },
        authorId: { not: userId },
        conversation: {
          kind: 'channel',
          members: { some: { userId, leftAt: null } },
        },
      },
      select: { id: true },
    });

    let counted = 0;
    for (const message of messages) {
      const created = await this.prisma.chatMessageView
        .create({ data: { messageId: message.id, userId } })
        .catch(() => null);
      // Повтор ловится уникальным индексом: второй просмотр не считается.
      if (!created) continue;
      await this.prisma.chatMessage.update({
        where: { id: message.id },
        data: { viewsCount: { increment: 1 } },
      });
      counted += 1;
    }

    return { counted };
  }

  private async requireMessage(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        authorId: true,
        deletedAt: true,
      },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    // Доступ к беседе проверяет вызывающий метод; здесь только наличие.
    void userId;
    return message;
  }

  /**
   * Уведомление порталу. Событие самодостаточно: подписчик не ходит в
   * таблицы чата за именем и текстом.
   */
  private async notify(
    conversation: ChatConversationRow,
    senderId: string,
    body: string,
    conversationId: string,
  ) {
    const sender = conversation.members.find((m) => m.userId === senderId);
    if (!sender) return;
    const senderName = resolveDisplayName(sender.user);
    const now = new Date();

    for (const member of conversation.members) {
      if (member.userId === senderId || member.leftAt) continue;
      if (member.mutedUntil && member.mutedUntil > now) continue;
      if (await this.presence.isViewing(member.userId, conversationId)) continue;

      const event: NotificationEvent =
        conversation.state === 'request'
          ? {
              name: 'chat.request-received',
              recipientId: member.userId,
              senderName,
              body,
              conversationId,
            }
          : {
              name: 'chat.message-sent',
              recipientId: member.userId,
              senderName,
              conversationTitle:
                conversation.kind === 'direct'
                  ? undefined
                  : (conversation.title ?? undefined),
              body,
              conversationId,
            };
      this.bus.emit(event.name, event);
    }
  }

  /** Ошибки проверки — это 400, а не 500. */
  private validated<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof ChatValidationError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
}
