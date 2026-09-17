import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  NotificationDeviceStats,
  NotificationDeviceTestResult,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';
import { NotificationsService } from './notifications.service';

/** Телефоны с приложением в админке уведомлений: сводка и пуш себе. */
@Controller('admin/notifications/devices')
@UseGuards(AuthGuard)
export class NotificationDevicesAdminController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly nativePush: NativePushService,
    private readonly fcm: FcmSenderService,
  ) {}

  @Get()
  stats(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationDeviceStats> {
    this.assertAdmin(user);
    return this.notifications.deviceStats(this.fcm.configured);
  }

  /**
   * Тестовый пуш на свои телефоны. Проверяет всю цепочку: ключ на сервере,
   * токен в базе, канал уведомлений в приложении.
   */
  @Post('test')
  test(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationDeviceTestResult> {
    this.assertAdmin(user);
    return this.nativePush.sendToUsers([user.sub], {
      title: 'VedaMatch',
      body: 'Тестовое уведомление: пуши в приложение работают',
      url: '/',
      tag: 'push-test',
    });
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
