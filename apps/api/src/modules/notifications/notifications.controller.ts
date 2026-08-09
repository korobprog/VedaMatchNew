import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccessTokenPayload,
  NotificationPreferencesDto,
  PushSubscriptionRequest,
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
  async unsubscribe(@Body() body: { endpoint: string }): Promise<{ ok: true }> {
    await this.notifications.deleteSubscription(body.endpoint);
    return { ok: true };
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
