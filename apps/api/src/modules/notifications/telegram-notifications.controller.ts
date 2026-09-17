import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  EnableTelegramNotificationsRequest,
  TelegramBotStatusResponse,
  TelegramNotificationStatusResponse,
  UpdateTelegramNotificationStatusRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TelegramInitDataVerifierService } from '../auth/telegram-init-data-verifier.service';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramSenderService } from './telegram-sender.service';

/**
 * Экран «Аккаунт» → «Уведомления в Telegram» (веха 4) и служебная проверка
 * с прода. Подпись мини-приложения проверяется здесь же через
 * `TelegramInitDataVerifierService` — портальная инфраструктура из
 * `AuthModule`, без чтения `UserIdentity` (контракт сервисных модулей).
 */
@Controller('notifications/telegram')
export class TelegramNotificationsController {
  constructor(
    private readonly telegram: TelegramNotificationsService,
    private readonly verifier: TelegramInitDataVerifierService,
    private readonly sender: TelegramSenderService,
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  status(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<TelegramNotificationStatusResponse> {
    return this.telegram.status(user.sub);
  }

  @UseGuards(AuthGuard)
  @Put()
  setEnabled(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateTelegramNotificationStatusRequest,
  ): Promise<TelegramNotificationStatusResponse> {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled должен быть булевым');
    }
    return this.telegram.setEnabled(user.sub, body.enabled);
  }

  /**
   * После `Telegram.WebApp.requestWriteAccess()` в мини-приложении: та же
   * подпись `initData`, что и у входа/привязки, только тут она подтверждает
   * не «кто пришёл», а «дайте боту написать этому уже вошедшему человеку».
   *
   * Подписи одной лишь подлинности недостаточно: `initData` подтверждает
   * только то, что человек внутри Telegram-клиента с каким-то реальным
   * chat_id, но НЕ то, что этот чат принадлежит текущему аккаунту портала —
   * подпись Говинды остаётся подлинной, даже если её пришлёт Радха. Раунд
   * оценки вехи 4 (живой стенд, п.7) воспроизвёл именно это: без проверки
   * владения устройство 770402 переезжало на чужой аккаунт. Поэтому здесь —
   * `verifyForUser`, а не `verify`: она же сверяет `UserIdentity` в `auth`,
   * не отдавая её наружу.
   */
  @UseGuards(AuthGuard)
  @Post('enable')
  async enable(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: EnableTelegramNotificationsRequest,
  ): Promise<TelegramNotificationStatusResponse> {
    const verified = await this.verifier.verifyForUser(
      body?.initData,
      user.sub,
    );
    if (!verified.ok) {
      if (verified.reason === 'not-configured') {
        throw new ServiceUnavailableException(
          'Уведомления через Telegram не настроены',
        );
      }
      if (verified.reason === 'not-linked') {
        throw new ConflictException(
          'Сначала привяжите этот Telegram к аккаунту',
        );
      }
      throw new UnauthorizedException('Telegram не подтвердил разрешение');
    }
    return this.telegram.enable(user.sub, String(verified.user.id));
  }

  /** Админка: с прода проверить, что сервер вообще достаёт до Bot API. */
  @UseGuards(AuthGuard)
  @Get('status')
  botStatus(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<TelegramBotStatusResponse> {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    return this.sender.getBotStatus();
  }
}
