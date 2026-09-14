import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  ChatOfficialChannelStats,
  ChatOfficialChannelSyncResult,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { officialMembership } from './official-channel';

/** Имя события дублируется литералом: модули не импортируют друг друга. */
const USER_REGISTERED = 'auth.user.registered';

/**
 * Официальный канал VedaMatch: один на портал, создан миграцией
 * `chat_official_channel`. Здесь подписка новичков и досинхронизация.
 *
 * Кто сам вышел из канала, того обратно не добавляем: строка членства с
 * `leftAt` остаётся, а подписка создаёт только отсутствующие строки.
 */
@Injectable()
export class ChatOfficialChannelService {
  private readonly logger = new Logger(ChatOfficialChannelService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async channelId(): Promise<string | null> {
    const row = await this.prisma.chatConversation.findFirst({
      where: { official: true },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  @OnEvent(USER_REGISTERED)
  onUserRegistered(event: { userId: string }): void {
    void this.subscribeNewcomer(event.userId);
  }

  async subscribeNewcomer(userId: string): Promise<void> {
    try {
      const [conversationId, user] = await Promise.all([
        this.channelId(),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
      ]);
      if (!conversationId || !user) return;
      const membership = officialMembership(user.role, new Date());
      await this.prisma.chatMember.createMany({
        data: [{ conversationId, userId, ...membership }],
        skipDuplicates: true,
      });
    } catch (error) {
      // Регистрация от неудачной подписки страдать не должна.
      this.logger.warn(
        `Не удалось подписать ${userId} на официальный канал: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async stats(): Promise<ChatOfficialChannelStats> {
    const channel = await this.prisma.chatConversation.findFirst({
      where: { official: true },
      select: { id: true, title: true },
    });
    if (!channel) throw new NotFoundException('Официальный канал не создан');
    const now = new Date();
    const [subscribers, left, notificationsOn, activeUsers, members] =
      await Promise.all([
        this.prisma.chatMember.count({
          where: { conversationId: channel.id, leftAt: null },
        }),
        this.prisma.chatMember.count({
          where: { conversationId: channel.id, leftAt: { not: null } },
        }),
        this.prisma.chatMember.count({
          where: {
            conversationId: channel.id,
            leftAt: null,
            OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }],
          },
        }),
        this.prisma.user.count({ where: { accountStatus: 'active' } }),
        this.prisma.chatMember.count({
          where: {
            conversationId: channel.id,
            user: { accountStatus: 'active' },
          },
        }),
      ]);
    return {
      conversationId: channel.id,
      title: channel.title ?? 'VedaMatch',
      subscribers,
      left,
      notificationsOn,
      missing: Math.max(0, activeUsers - members),
    };
  }

  /**
   * «Подписать всех»: строки членства для активных участников, у которых их
   * нет, и роль admin для администраторов портала. Вышедших не возвращает.
   */
  async syncMembers(): Promise<ChatOfficialChannelSyncResult> {
    const conversationId = await this.channelId();
    if (!conversationId)
      throw new NotFoundException('Официальный канал не создан');
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        accountStatus: 'active',
        chatMemberships: { none: { conversationId } },
      },
      select: { id: true, role: true },
    });
    const { count: added } = await this.prisma.chatMember.createMany({
      data: users.map((user) => ({
        conversationId,
        userId: user.id,
        ...officialMembership(user.role, now),
      })),
      skipDuplicates: true,
    });
    await this.prisma.chatMember.updateMany({
      where: { conversationId, role: 'member', user: { role: 'admin' } },
      data: { role: 'admin' },
    });
    return { ...(await this.stats()), added };
  }
}
