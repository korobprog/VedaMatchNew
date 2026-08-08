import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  UnionPrivacySettings,
  UnionSendChatMessageRequest,
  UnionUserSummary,
} from '@vedamatch/shared';
import { calculateAge } from '../users/age';
import { toActivityLevel } from './union-activity';
import { isVerifiedDevotee } from './union-verification';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_CHAT_MESSAGE_LENGTH = 2000;

@Injectable()
export class UnionChatService {
  constructor(private readonly prisma: PrismaService) {}

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

    const chats: UnionChatSummary[] = connections
      .map((connection) => {
        const otherUser =
          connection.fromUserId === userId
            ? connection.toUser
            : connection.fromUser;
        const last = connection.messages[0] ?? null;
        return {
          requestId: connection.id,
          user: this.toUserSummary(otherUser),
          lastMessage: last?.body ?? null,
          lastMessageAt: last?.createdAt.toISOString() ?? null,
          lastMessageMine: last?.fromUserId === userId,
          unreadCount: unreadByRequest.get(connection.id) ?? 0,
        };
      })
      .sort((left, right) => this.chatOrder(right) - this.chatOrder(left));

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

    return {
      connection: this.toConnectionSummary(connection, userId),
      otherUser: this.toUserSummary(otherUser),
      messages: messages.map((message) => ({
        id: message.id,
        requestId: message.requestId,
        fromUserId: message.fromUserId,
        body: message.body,
        mine: message.fromUserId === userId,
        createdAt: message.createdAt.toISOString(),
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

    return {
      id: message.id,
      requestId: message.requestId,
      fromUserId: message.fromUserId,
      body: message.body,
      mine: true,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** Свежие переписки выше; диалоги без сообщений уходят в конец списка. */
  private chatOrder(chat: UnionChatSummary): number {
    return chat.lastMessageAt ? Date.parse(chat.lastMessageAt) : 0;
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

  private toUserSummary(
    user: User & { unionProfile?: { privacy: unknown } | null },
  ): UnionUserSummary {
    const privacy =
      (user.unionProfile?.privacy as UnionPrivacySettings | null) ?? null;
    const location = this.location(user);
    return {
      id: user.id,
      name: user.name,
      avatarUrl: privacy?.photo === 'hidden' ? null : user.avatarUrl,
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
