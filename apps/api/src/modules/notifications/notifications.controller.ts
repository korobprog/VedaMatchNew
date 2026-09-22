import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccessTokenPayload,
  NotificationDeliveryStatusDto,
  NotificationInboxResponse,
  NotificationPreferencesDto,
  NotificationReadStateRequest,
  NotificationReadStateResponse,
  NotificationUnreadCountResponse,
  PushSubscriptionRequest,
  RegisterNotificationDeviceRequest,
  UnregisterNotificationDeviceRequest,
  UpdateNotificationPreferencesRequest,
  VapidKeyResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Публичный ключ отдаём эндпоинтом, а не NEXT_PUBLIC-переменной:
   *  ротация ключа не должна требовать пересборки веба. */
  @Get('vapid-key')
  vapidKey(): VapidKeyResponse {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? '' };
  }

  @UseGuards(AuthGuard)
  @Post('subscriptions')
  async subscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: PushSubscriptionRequest,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ ok: true }> {
    await this.notifications.saveSubscription(user.sub, body, userAgent);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Delete('subscriptions')
  async unsubscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { endpoint: string },
  ): Promise<{ ok: true }> {
    await this.notifications.deleteOwnSubscription(user.sub, body?.endpoint);
    return { ok: true };
  }

  /** Телефон с приложением VedaMatch сообщает токен пушей после входа. */
  @UseGuards(AuthGuard)
  @Post('devices')
  async registerDevice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: RegisterNotificationDeviceRequest,
  ): Promise<{ ok: true }> {
    await this.notifications.saveDevice(user.sub, body);
    return { ok: true };
  }

  /** Выход из приложения: телефон больше не получает пуши этого человека. */
  @UseGuards(AuthGuard)
  @Delete('devices')
  async unregisterDevice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UnregisterNotificationDeviceRequest,
  ): Promise<{ ok: true }> {
    await this.notifications.deleteOwnDevice(user.sub, body?.token);
    return { ok: true };
  }

  /** Счётчик для значка на колокольчике: отдельный лёгкий запрос,
   *  его дёргает каждая страница портала. */
  @UseGuards(AuthGuard)
  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationUnreadCountResponse> {
    return { unreadCount: await this.notifications.countUnread(user.sub) };
  }

  /**
   * Порция ленты (VED-267). `cursor` — строка из прошлого ответа, `q` — поиск
   * по заголовку и тексту, `limit` — размер порции. Без них приходит первая
   * страница обычной ленты, как и раньше.
   *
   * Поиск серверный: фильтр по уже загруженному искал бы только в пришедших
   * порциях и обманывал бы человека тем, что «ничего нет».
   */
  @UseGuards(AuthGuard)
  @Get('inbox')
  inbox(
    @CurrentUser() user: AccessTokenPayload,
    @Query('cursor') cursor?: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationInboxResponse> {
    return this.notifications.listInbox(user.sub, { cursor, query, limit });
  }

  /** Пустой `ids` — «прочитано всё»: страница списка гасит счётчик целиком. */
  @UseGuards(AuthGuard)
  @Post('inbox/read')
  async markRead(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { ids?: string[] },
  ): Promise<{ ok: true }> {
    await this.notifications.markRead(user.sub, body?.ids);
    return { ok: true };
  }

  /**
   * Своя отметка у одного уведомления (VED-143), в обе стороны.
   *
   * Отдельно от `POST inbox/read`: тот помечает пачку и только прочитанным, а
   * здесь нужен откат («Вернуть в непрочитанные») и свежий счётчик в ответе —
   * значок на колокольчике гаснет и загорается вместе с кнопкой, без второго
   * запроса и без перезагрузки страницы.
   *
   * `read` проверяется руками, а не `ParseBoolPipe`: тело приходит из JSON,
   * где `true`/`false` уже булевы, и строка «true» здесь означала бы, что
   * клиент шлёт не то, что обещал. Молча считать её истиной нельзя — отметка
   * не должна ставиться от опечатки.
   */
  @UseGuards(AuthGuard)
  @Patch('inbox/:id/read')
  setReadState(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: NotificationReadStateRequest,
  ): Promise<NotificationReadStateResponse> {
    if (typeof body?.read !== 'boolean')
      throw new BadRequestException('Поле read должно быть true или false');
    return this.notifications.setReadState(user.sub, id, body.read);
  }

  /**
   * Есть ли куда доставлять уведомления этому человеку (VED-314). Настройки
   * спрашивают об этом сами: человек жал «включить» и оставался в уверенности,
   * что всё работает, — даже когда ни одной живой точки доставки у него не
   * было и девять уведомлений за вечер прошли мимо.
   */
  @UseGuards(AuthGuard)
  @Get('delivery-status')
  deliveryStatus(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationDeliveryStatusDto> {
    return this.notifications.deliveryStatus(user.sub);
  }

  @UseGuards(AuthGuard)
  @Get('preferences')
  preferences(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.getPreferences(user.sub);
  }

  @UseGuards(AuthGuard)
  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.updatePreferences(user.sub, body);
  }
}
