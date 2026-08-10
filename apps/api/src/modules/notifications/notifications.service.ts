import { Injectable } from '@nestjs/common';
import type {
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
};

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
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }
}
