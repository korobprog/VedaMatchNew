import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationInboxResponse,
  NotificationItemDto,
  NotificationPreferencesDto,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const defaults: NotificationPreferencesDto = {
  enabled: true,
  chat: true,
  connections: true,
  support: true,
  transits: true,
  market: true,
  notices: true,
  motivation: true,
  announcements: true,
};

/**
 * Сколько прочитанное живёт до удаления. Не ноль: иначе перезагрузка страницы
 * сразу после открытия списка показала бы пустоту, и человек решил бы, что
 * уведомление потерялось. Не сутки: колокольчик — список непрочитанного,
 * а не архив.
 */
/**
 * Прочитанное живёт неделю, а не четверть часа: список показывает его ниже
 * непрочитанного, и вернуться к уже открытому уведомлению — обычное дело.
 */
const readRetentionMs = 7 * 24 * 60 * 60 * 1000;

/** Непрочитанное тоже не копится вечно: неактивный аккаунт иначе растит таблицу. */
const unreadRetentionMs = 30 * 24 * 60 * 60 * 1000;

export interface InboxDraft {
  title: string;
  body: string;
  url: string;
  category: NotificationCategory;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Один endpoint — одно устройство. Если на нём сменился аккаунт,
   *  подписка переезжает к текущему пользователю, а не дублируется. */
  async saveSubscription(
    userId: string,
    dto: PushSubscriptionRequest,
    userAgent?: string,
  ): Promise<void> {
    const data = {
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: data,
      update: data,
    });
  }

  /**
   * Пользовательская отписка: удаляем только собственную подписку —
   * иначе, зная чужой endpoint, можно было бы отключить чужие пуши.
   */
  async deleteOwnSubscription(userId: string, endpoint: string): Promise<void> {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      throw new BadRequestException('endpoint обязателен');
    }
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
  }

  /** Служебная чистка протухших endpoint'ов после 404/410 от push-сервиса. */
  async deleteSubscription(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async listSubscriptions(userId: string): Promise<StoredSubscription[]> {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) return { ...defaults };
    return {
      enabled: row.enabled,
      chat: row.chat,
      connections: row.connections,
      support: row.support,
      transits: row.transits,
      market: row.market,
      notices: row.notices,
      motivation: row.motivation,
      announcements: row.announcements,
    };
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesDto> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferencesDto = {
      enabled: patch.enabled ?? current.enabled,
      chat: patch.chat ?? current.chat,
      connections: patch.connections ?? current.connections,
      support: patch.support ?? current.support,
      transits: patch.transits ?? current.transits,
      market: patch.market ?? current.market,
      notices: patch.notices ?? current.notices,
      motivation: patch.motivation ?? current.motivation,
      announcements: patch.announcements ?? current.announcements,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }

  // ===== Колокольчик =====

  async addToInbox(userId: string, draft: InboxDraft): Promise<void> {
    await this.prisma.notificationItem.create({
      data: { userId, ...draft },
    });
  }

  /**
   * Одинаковое уведомление многим за один запрос. Нужно рассылкам: класть его
   * по одному — двести INSERT'ов на пакет.
   */
  async addManyToInbox(userIds: string[], draft: InboxDraft): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.notificationItem.createMany({
      data: userIds.map((userId) => ({ userId, ...draft })),
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notificationItem.count({
      where: { userId, readAt: null },
    });
  }

  /**
   * Отдаёт непрочитанное и попутно подчищает хвост: прочитанное старше
   * `readRetentionMs` и совсем древнее непрочитанное. Чистка привязана к чтению
   * списка, а не к крону — отдельный планировщик ради этого не нужен.
   */
  async listInbox(userId: string): Promise<NotificationInboxResponse> {
    await this.purge(userId);
    const rows = await this.prisma.notificationItem.findMany({
      where: { userId },
      // Непрочитанное первым, внутри групп — свежее сверху: человек приходит
      // за новым, а прочитанное держим под рукой на случай «а что там было».
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        body: true,
        url: true,
        category: true,
        createdAt: true,
        readAt: true,
      },
    });
    const items: NotificationItemDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      url: row.url,
      category: row.category as NotificationCategory,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    }));
    return {
      items,
      unreadCount: items.filter((item) => item.readAt === null).length,
    };
  }

  /**
   * Помечает прочитанным. Без `ids` — весь непрочитанный список: колокольчик
   * гасит счётчик целиком, когда человек открыл страницу.
   */
  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notificationItem.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
  }

  private async purge(userId: string): Promise<void> {
    const now = Date.now();
    await this.prisma.notificationItem.deleteMany({
      where: {
        userId,
        OR: [
          { readAt: { lt: new Date(now - readRetentionMs) } },
          { createdAt: { lt: new Date(now - unreadRetentionMs) } },
        ],
      },
    });
  }
}
