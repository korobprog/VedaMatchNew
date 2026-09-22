import { Injectable, Logger } from '@nestjs/common';
import type { TelegramNotificationStatusResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deliveryHealthSelect,
  NotificationsService,
  type StoredDevice,
} from './notifications.service';
import {
  TELEGRAM_DEVICE_PLATFORM,
  TELEGRAM_DEVICE_PROVIDER,
} from './telegram-device';

/** Устройство бота вместе с отметками живости: исход отправки записывает
 *  `NotificationsService.recordDeviceResult` (VED-314). */
export type TelegramDeviceRow = StoredDevice;

/**
 * Устройство доставки `@vedamatch_bot` и тумблер его доставки. Отдельно от
 * `NotificationsService`, хотя таблицы те же: здесь логика веха 4 целиком —
 * от событий `auth.telegram.*` до экрана «Аккаунт», а `NotificationsService`
 * несёт общий конвейер для всех служб доставки сразу.
 */
@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Реакция на `auth.telegram.connected` (и на явное `enable()`, см. ниже).
   * `canWrite: false` — вход или привязка состоялись, но бот писать не
   * может: устройство не заводим (заводить нечего) и существующее не
   * трогаем — расхождение `canWrite` между входами не повод внезапно
   * замолчать для уже разрешившего.
   *
   * Почему `upsert` по глобально уникальному `token` здесь безопасен, хотя
   * формально может переписать чужой `userId`: `auth` гарантирует не больше
   * одного владельца Telegram-id одновременно
   * (`IdentityService.link`/`resolve`, `provider_externalId` уникален), а
   * `AUTH_TELEGRAM_CONNECTED_EVENT` шлётся только для фактического текущего
   * владельца идентичности — увести устройство у ещё привязанного человека
   * этим путём невозможно (раунд оценки вехи 4, п.7: угон отсюда не
   * воспроизвёлся — воспроизвёлся через `POST .../enable` без проверки
   * владения, закрыто отдельно в `verifyForUser`). Сменить владельца токен
   * может только если прежний уже отвязал Telegram (его `disconnect()` уже
   * удалил это устройство до того, как id снова стало можно привязать) — в
   * таком случае `existing` ниже не найдётся вовсе. Если `existing` всё же
   * указывает на ДРУГОГО пользователя — это нарушение инварианта на стороне
   * `auth`, а не штатный сценарий: не бросаем (человек не должен молча
   * остаться без уведомлений из-за чужой ошибки), но логируем предупреждение
   * — есть что расследовать.
   */
  async setConnected(
    userId: string,
    telegramUserId: string,
    canWrite: boolean,
  ): Promise<void> {
    if (!canWrite) return;
    const existing = await this.prisma.notificationDevice.findUnique({
      where: { token: telegramUserId },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      this.logger.warn(
        `Устройство Telegram ${telegramUserId} переходит от ${existing.userId} к ${userId} без события отвязки — проверьте auth`,
      );
    }
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
      select: { token: true, ...deliveryHealthSelect },
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
