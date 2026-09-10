import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  ChatActiveCallState,
  ChatCallDto,
  ChatCallSignalRequest,
  ChatIceServersState,
  EndChatCallRequest,
  StartChatCallRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { ChatCallsService } from './chat-calls.service';
import {
  buildIceServers,
  buildTurnCredentials,
  DEFAULT_TURN_TLS_PORT,
  TURN_CREDENTIAL_TTL_SECONDS,
} from './turn-credentials';

/**
 * Звонки в «Общении» (docs/chat-calls-plan.md). Сигналинг WebRTC: клиент
 * шлёт сюда POST'ы, а получает ответы второй стороны через общий
 * `GET /chat/stream` — отдельного канала под звонки нет.
 */
@Controller('chat/calls')
@UseGuards(AuthGuard)
export class ChatCallsController {
  constructor(
    private readonly config: ConfigService,
    private readonly calls: ChatCallsService,
  ) {}

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

  /** История звонков человека. Буквальный путь — до `:id`, иначе он его съест. */
  @Get('history')
  history(@CurrentUser() user: AccessTokenPayload) {
    return this.calls.historyForUser(user.sub);
  }

  @Get('active')
  async active(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ChatActiveCallState> {
    return { call: await this.calls.active(user.sub) };
  }

  /** Десять попыток дозвона в минуту — защита от назойливости. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: StartChatCallRequest,
  ): Promise<ChatCallDto> {
    return this.calls.start(user.sub, body);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<ChatCallDto> {
    return this.calls.accept(user.sub, id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<ChatCallDto> {
    return this.calls.decline(user.sub, id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: EndChatCallRequest,
  ): Promise<ChatCallDto> {
    return this.calls.end(user.sub, id, body ?? {});
  }

  /**
   * ICE-кандидаты летят десятками в первые секунды; лимит выше обычного,
   * но конечный — это всё ещё POST на каждый.
   */
  @Post(':id/signal')
  @HttpCode(204)
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async signal(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ChatCallSignalRequest,
  ): Promise<void> {
    await this.calls.signal(user.sub, id, body?.signal);
  }
}
