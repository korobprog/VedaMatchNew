import { Injectable } from '@nestjs/common';
import type { TelegramNotificationStatusResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** Провайдер и платформа устройства доставки через бота — те же строки,
 *  что ищет `deliver()` при рассылке (`notifications.listener.ts`). Не
 *  входят в `NotificationDeviceProvider`/`NotificationDevicePlatform` из
 *  `@vedamatch/shared`: те валидируют регистрацию телефонов с приложением
 *  (`POST /notifications/devices`), а телеграм-устройство заводится только
 *  отсюда, по подписи Telegram, а не произвольным телом запроса. */
export const TELEGRAM_DEVICE_PROVIDER = 'telegram';
export const TELEGRAM_DEVICE_PLATFORM = 'telegram';

export interface TelegramDeviceRow {
  token: string;
}

/**
 * Устройство доставки `@vedamatch_bot` и тумблер его доставки. Отдельно от
 * `NotificationsService`, хотя таблицы те же: здесь логика веха 4 целиком —
 * от событий `auth.telegram.*` до экрана «Аккаунт», а `NotificationsService`
 * несёт общий конвейер для всех служб доставки сразу.
 */
@Injectable()
export class TelegramNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Реакция на `auth.telegram.connected`. `canWrite: false` — вход или
   * привязка состоялись, но бот писать не может: устройство не заводим
   * (заводить нечего) и существующее не трогаем — расхождение `canWrite`
   * между входами не повод внезапно замолчать для уже разрешившего.
   */
  async setConnected(
    userId: string,
    telegramUserId: string,
    canWrite: boolean,
  ): Promise<void> {
    if (!canWrite) return;
    const data = {
      userId,
      provider: TELEGRAM_DEVICE_PROVIDER,
      platform: TELEGRAM_DEVICE_PLATFORM,
      token: telegramUserId,
    };
    await this.prisma.notificationDevice.upsert({
      where: { token: telegramUserId },
      create: data,
      update: data,
    });
  }

  /** Реакция на `auth.telegram.disconnected`: без Telegram боту писать
   *  некому — устройство гасится безусловно, тумблер `telegram` не трогаем
   *  (новая привязка вернёт прежнюю настройку, а не молчание по умолчанию). */
  async disconnect(userId: string): Promise<void> {
    await this.prisma.notificationDevice.deleteMany({
      where: { userId, provider: TELEGRAM_DEVICE_PROVIDER },
    });
  }

  /** Явное разрешение из мини-приложения (`WebApp.requestWriteAccess()` →
   *  `POST /notifications/telegram/enable`): устройство заводится всегда,
   *  в отличие от входа — это прямой ответ «да» на запрос доступа. */
  async enable(
    userId: string,
    telegramUserId: string,
  ): Promise<TelegramNotificationStatusResponse> {
    await this.setConnected(userId, telegramUserId, true);
    return this.status(userId);
  }

  /** Устройство протухло по ответу Bot API (403 или «chat not found») —
   *  убирается по токену, как веб-подписки и телефоны FCM. */
  async deleteDevice(telegramUserId: string): Promise<void> {
    await this.prisma.notificationDevice.deleteMany({
      where: { token: telegramUserId, provider: TELEGRAM_DEVICE_PROVIDER },
    });
  }

  /** Устройства получателя для рассылки — используется `deliver()`. */
  async listDevices(userId: string): Promise<TelegramDeviceRow[]> {
    return this.prisma.notificationDevice.findMany({
      where: { userId, provider: TELEGRAM_DEVICE_PROVIDER },
      select: { token: true },
    });
  }

  async status(userId: string): Promise<TelegramNotificationStatusResponse> {
    const [device, preferences] = await Promise.all([
      this.prisma.notificationDevice.findFirst({
        where: { userId, provider: TELEGRAM_DEVICE_PROVIDER },
        select: { id: true },
      }),
      this.notifications.getPreferences(userId),
    ]);
    return { connected: device !== null, enabled: preferences.telegram };
  }

  async setEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<TelegramNotificationStatusResponse> {
    await this.notifications.updatePreferences(userId, { telegram: enabled });
    return this.status(userId);
  }
}
