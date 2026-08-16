import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { UnionConnectionRequest, User } from '@prisma/client';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  UnionChatMessageDto,
  UnionChatState,
  UnionChatsState,
  UnionChatSummary,
  UnionConnectionSummary,
  UnionEditChatMessageRequest,
  UnionMessageReactionSummary,
  UnionPrivacySettings,
  UnionSendChatMessageRequest,
  UnionSetReactionRequest,
  UnionUserSummary,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import type { NotificationEvent } from '@vedamatch/shared';
import { calculateAge } from '../users/age';
import { toActivityLevel } from './union-activity';
import { isVerifiedDevotee } from './union-verification';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const MAX_CHAT_MESSAGE_LENGTH = 2000;

/** Разрешённые эмодзи для реакций — узкий белый список вместо любых строк. */
export const ALLOWED_REACTION_EMOJIS = [
  '❤️',
  '🙏',
  '😂',
  '😍',
  '👍',
  '🔥',
  '🌸',
  '🙌',
] as const;

@Injectable()
export class UnionChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Список диалогов: принятые заявки плюс последнее сообщение и счётчик
   * непрочитанного. Непрочитанное — входящие сообщения без `readAt`.
   */
  async listChats(userId: string): Promise<UnionChatsState> {
    const connections = await this.prisma.unionConnectionRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      include: {
        fromUser: { include: { unionProfile: true } },
        toUser: { include: { unionProfile: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const unreadRows = await this.prisma.unionChatMessage.groupBy({
      by: ['requestId'],
      where: {
        readAt: null,
        fromUserId: { not: userId },
        request: {
          status: 'accepted',
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
      },
      _count: { _all: true },
    });
    const unreadByRequest = new Map(
      unreadRows.map((row) => [row.requestId, row._count._all]),
    );

    const chats: UnionChatSummary[] = (
      await Promise.all(
        connections.map(async (connection) => {
          const otherUser =
            connection.fromUserId === userId
              ? connection.toUser
              : connection.fromUser;
          const last = connection.messages[0] ?? null;
          return {
            requestId: connection.id,
            user: await this.toUserSummary(otherUser),
            lastMessage: last?.body ?? null,
            lastMessageAt: last?.createdAt.toISOString() ?? null,
            lastMessageMine: last?.fromUserId === userId,
            unreadCount: unreadByRequest.get(connection.id) ?? 0,
          };
        }),
      )
    ).sort((left, right) => this.chatOrder(right) - this.chatOrder(left));

    return {
      chats,
      unreadTotal: chats.reduce((sum, chat) => sum + chat.unreadCount, 0),
    };
  }

  async getChat(userId: string, requestId: string): Promise<UnionChatState> {
    const connection = await this.getAcceptedConnection(userId, requestId);

    // Открыли чат — входящие считаются прочитанными.
    await this.prisma.unionChatMessage.updateMany({
      where: {
        requestId: connection.id,
        fromUserId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    const otherUser =
      connection.fromUserId === userId
        ? connection.toUser
        : connection.fromUser;

    const messages = await this.prisma.unionChatMessage.findMany({
      where: { requestId: connection.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const reactionsByMessage = await this.loadReactions(
      messages.map((message) => message.id),
      userId,
    );

    return {
      connection: this.toConnectionSummary(connection, userId),
      otherUser: await this.toUserSummary(otherUser),
      messages: messages.map((message) => ({
        id: message.id,
        requestId: message.requestId,
        fromUserId: message.fromUserId,
        body: message.body,
        mine: message.fromUserId === userId,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        reactions: reactionsByMessage.get(message.id) ?? [],
      })),
    };
  }

  async sendMessage(
    userId: string,
    requestId: string,
    body: UnionSendChatMessageRequest,
  ): Promise<UnionChatMessageDto> {
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Message is required');
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or shorter`,
      );
    }

    const connection = await this.getAcceptedConnection(userId, requestId);
    const message = await this.prisma.unionChatMessage.create({
      data: {
        requestId: connection.id,
        fromUserId: userId,
        body: text,
      },
    });

    // Получатель — вторая сторона связи. Имена уже загружены в
    // getAcceptedConnection, дополнительный запрос не нужен.
    const isSender = connection.fromUserId === userId;
    const recipientId = isSender ? connection.toUserId : connection.fromUserId;
    const sender = isSender ? connection.fromUser : connection.toUser;
    const event = {
      name: 'union.chat.message-sent',
      recipientId,
      senderName: resolveDisplayName(sender),
      body: text,
      requestId: connection.id,
    } satisfies NotificationEvent;
    this.events.emit(event.name, event);

    return {
      id: message.id,
      requestId: message.requestId,
      fromUserId: message.fromUserId,
      body: message.body,
      mine: true,
      createdAt: message.createdAt.toISOString(),
      editedAt: null,
      reactions: [],
    };
  }

  async editMessage(
    userId: string,
    requestId: string,
    messageId: string,
    body: UnionEditChatMessageRequest,
  ): Promise<UnionChatMessageDto> {
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Message is required');
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or shorter`,
      );
    }

    const connection = await this.getAcceptedConnection(userId, requestId);
    const existing = await this.prisma.unionChatMessage.findUnique({
      where: { id: messageId },
    });
    if (!existing || existing.requestId !== connection.id) {
      throw new NotFoundException('Message not found');
    }
    if (existing.fromUserId !== userId) {
      throw new ForbiddenException('Not your message');
    }

    const message = await this.prisma.unionChatMessage.update({
      where: { id: messageId },
      data: { body: text, editedAt: new Date() },
    });
    const reactions =
      (await this.loadReactions([message.id], userId)).get(message.id) ?? [];

    return {
      id: message.id,
      requestId: message.requestId,
      fromUserId: message.fromUserId,
      body: message.body,
      mine: true,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      reactions,
    };
  }

  /**
   * Ставит реакцию пользователя на сообщение. Тот же эмодзи повторно —
   * снимает реакцию, другой — заменяет прежний (одна реакция на человека).
   */
  async setReaction(
    userId: string,
    requestId: string,
    messageId: string,
    body: UnionSetReactionRequest,
  ): Promise<UnionMessageReactionSummary[]> {
    const emoji = String(body.emoji ?? '');
    if (!(ALLOWED_REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw new BadRequestException('Unsupported emoji');
    }

    const connection = await this.getAcceptedConnection(userId, requestId);
    const message = await this.prisma.unionChatMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.requestId !== connection.id) {
      throw new NotFoundException('Message not found');
    }

    const existing = await this.prisma.unionMessageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });
    if (existing && existing.emoji === emoji) {
      await this.prisma.unionMessageReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.unionMessageReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { emoji },
        create: { messageId, userId, emoji },
      });
    }

    return (await this.loadReactions([messageId], userId)).get(messageId) ?? [];
  }

  private async loadReactions(
    messageIds: string[],
    userId: string,
  ): Promise<Map<string, UnionMessageReactionSummary[]>> {
    if (messageIds.length === 0) return new Map();
    const reactions = await this.prisma.unionMessageReaction.findMany({
      where: { messageId: { in: messageIds } },
    });

    const byMessage = new Map<
      string,
      Map<string, UnionMessageReactionSummary>
    >();
    for (const reaction of reactions) {
      const forMessage = byMessage.get(reaction.messageId) ?? new Map();
      const entry = forMessage.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        mine: false,
      };
      entry.count += 1;
      if (reaction.userId === userId) entry.mine = true;
      forMessage.set(reaction.emoji, entry);
      byMessage.set(reaction.messageId, forMessage);
    }

    const result = new Map<string, UnionMessageReactionSummary[]>();
    for (const [messageId, forMessage] of byMessage) {
      result.set(messageId, [...forMessage.values()]);
    }
    return result;
  }

  /** Свежие переписки выше; диалоги без сообщений уходят в конец списка. */
  private chatOrder(chat: UnionChatSummary): number {
    return chat.lastMessageAt ? Date.parse(chat.lastMessageAt) : 0;
  }

  /**
   * Открывает диалог с произвольным пользователем в обход обычного сценария
   * лайк → взаимность. Используется сервисами, где доступ друг к другу уже
   * подтверждён их собственной логикой (например, открытые контакты в
   * «Справочнике общины») — заводить там ещё один лайк незачем.
   *
   * Существующую связь просто переводит в `accepted`, не трогая её
   * направление и историю: так у диалога остаётся один `requestId`, даже
   * если раньше он был отклонён или отменён.
   */
  async openDirectChat(
    userId: string,
    otherUserId: string,
  ): Promise<{ chatId: string }> {
    if (userId === otherUserId) {
      throw new BadRequestException('Нельзя открыть чат с самим собой');
    }

    const existing = await this.prisma.unionConnectionRequest.findFirst({
      where: {
        OR: [
          { fromUserId: userId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: userId },
        ],
      },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status !== 'accepted') {
        await this.prisma.unionConnectionRequest.update({
          where: { id: existing.id },
          data: { status: 'accepted', respondedAt: new Date() },
        });
      }
      return { chatId: existing.id };
    }

    const created = await this.prisma.unionConnectionRequest.create({
      data: {
        fromUserId: userId,
        toUserId: otherUserId,
        status: 'accepted',
        respondedAt: new Date(),
      },
      select: { id: true },
    });
    return { chatId: created.id };
  }

  private async getAcceptedConnection(userId: string, requestId: string) {
    const connection = await this.prisma.unionConnectionRequest.findUnique({
      where: { id: requestId },
      include: {
        fromUser: { include: { unionProfile: true } },
        toUser: { include: { unionProfile: true } },
      },
    });
    if (!connection) throw new NotFoundException('Chat not found');
    if (connection.fromUserId !== userId && connection.toUserId !== userId) {
      throw new ForbiddenException('Not your chat');
    }
    if (connection.status !== 'accepted') {
      throw new BadRequestException('Chat is available only after a match');
    }
    return connection;
  }

  private toConnectionSummary(
    connection: UnionConnectionRequest,
    currentUserId: string,
  ): UnionConnectionSummary {
    return {
      id: connection.id,
      status: connection.status,
      direction:
        connection.fromUserId === currentUserId ? 'outgoing' : 'incoming',
      isSuperlike: connection.isSuperlike,
      message: connection.message,
      createdAt: connection.createdAt.toISOString(),
      respondedAt: connection.respondedAt?.toISOString() ?? null,
    };
  }

  private async toUserSummary(
    user: User & { unionProfile?: { privacy: unknown } | null },
  ): Promise<UnionUserSummary> {
    const privacy =
      (user.unionProfile?.privacy as UnionPrivacySettings | null) ?? null;
    const location = this.location(user);
    return {
      id: user.id,
      name: resolveDisplayName(user),
      avatarUrl:
        privacy?.photo === 'hidden'
          ? null
          : await this.users.resolveAvatarUrl(user),
      city: privacy?.city === 'hidden' ? null : (location?.city ?? null),
      country: privacy?.city === 'hidden' ? null : (location?.country ?? null),
      spiritualStage: user.spiritualStage,
      age: privacy?.age === 'hidden' ? null : calculateAge(user.birthDate),
      activity: toActivityLevel(user.lastSeenAt),
      isVerifiedDevotee: isVerifiedDevotee(user),
      isPhotoVerified: user.photoVerifiedAt !== null,
      photos: [],
      contacts:
        privacy?.contacts === 'hidden'
          ? null
          : {
              socialLinks:
                (user.socialLinks as ProfileSocialLinks | null) ?? {},
              messengers: (user.messengers as ProfileMessengers | null) ?? {},
            },
    };
  }

  private location(user: User): ProfileLocation | null {
    return (user.homeLocation as ProfileLocation | null) ?? null;
  }
}
