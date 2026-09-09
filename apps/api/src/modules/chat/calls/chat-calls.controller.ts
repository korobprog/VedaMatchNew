import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  ChatIceServersState,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import {
  buildIceServers,
  buildTurnCredentials,
  DEFAULT_TURN_TLS_PORT,
  TURN_CREDENTIAL_TTL_SECONDS,
} from './turn-credentials';

/**
 * Звонки в «Общении» — этап разведки (docs/chat-calls-plan.md, этап 0).
 * Пока здесь один маршрут: список ICE-серверов с короткоживущей учёткой
 * TURN. Сами звонки (создание, приём, сигналинг) появятся на этапе 1.
 */
@Controller('chat/calls')
@UseGuards(AuthGuard)
export class ChatCallsController {
  constructor(private readonly config: ConfigService) {}

  /**
   * Учётка живёт десять минут, и клиент запрашивает её перед каждым
   * звонком, а не раз на сессию. Лимит защищает секрет от массовой
   * выдачи подписей.
   */
  @Get('ice-servers')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  iceServers(@CurrentUser() user: AccessTokenPayload): ChatIceServersState {
    const host = this.config.get<string>('TURN_HOST') || undefined;
    const secret = this.config.get<string>('TURN_SECRET') || undefined;
    const credentials =
      host && secret ? buildTurnCredentials(secret, user.sub) : null;
    return {
      iceServers: buildIceServers(
        host,
        credentials,
        Number(this.config.get('TURN_TLS_PORT')) || DEFAULT_TURN_TLS_PORT,
      ),
      ttlSeconds: credentials ? TURN_CREDENTIAL_TTL_SECONDS : 0,
      turnConfigured: Boolean(credentials),
    };
  }
}
