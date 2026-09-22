import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  ChatGroupCallDto,
  ChatGroupCallSignalRequest,
  ChatGroupCallSignalsResponse,
  ChatGroupCallState,
  SetChatGroupCallStateRequest,
  StartChatGroupCallRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../../auth/auth.guard';
import { parseSignalsAfter } from '../signals-query';
import { ChatGroupCallsService } from './chat-group-calls.service';

/**
 * Групповые звонки в беседах (VED-293). Сигналинг тот же, что у звонка
 * один на один: POST'ы сюда, ответы — через общий `GET /chat/stream`.
 * ICE-серверы общие (`GET /chat/calls/ice-servers`) — своего эндпоинта у
 * группового звонка нет намеренно: TURN один и тот же.
 */
@Controller('chat/group-calls')
@UseGuards(AuthGuard)
export class ChatGroupCallsController {
  constructor(private readonly calls: ChatGroupCallsService) {}

  /** Идёт ли звонок в беседе — для плашки в переписке. */
  @Get('active')
  async active(
    @CurrentUser() user: AccessTokenPayload,
    @Query('conversationId') conversationId?: string,
  ): Promise<ChatGroupCallState> {
    return {
      call: conversationId
        ? await this.calls.activeForConversation(user.sub, conversationId)
        : await this.calls.activeForUser(user.sub),
    };
  }

  /** Начать звонок или войти в уже идущий в этой беседе. */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: StartChatGroupCallRequest,
  ): Promise<ChatGroupCallDto> {
    return this.calls.start(user.sub, body ?? { conversationId: '' });
  }

  @Post(':id/join')
  @HttpCode(200)
  join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<ChatGroupCallDto> {
    return this.calls.join(user.sub, id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<ChatGroupCallDto> {
    return this.calls.leave(user.sub, id);
  }

  @Post(':id/state')
  @HttpCode(200)
  state(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetChatGroupCallStateRequest,
  ): Promise<ChatGroupCallDto> {
    return this.calls.setState(user.sub, id, Boolean(body?.muted));
  }

  /**
   * «Я ещё здесь» — раз в `GROUP_CALL_HEARTBEAT_MS`. Лимит с запасом на
   * четырёх участников и повторы: четыре в минуту на человека штатно.
   */
  @Post(':id/heartbeat')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  heartbeat(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<ChatGroupCallDto> {
    return this.calls.heartbeat(user.sub, id);
  }

  /**
   * ICE-кандидаты летят десятками на КАЖДУЮ пару — при трёх собеседниках
   * втрое больше, чем в звонке один на один. Лимит поднят соразмерно, а не
   * «на глаз».
   */
  @Post(':id/signal')
  @HttpCode(204)
  @Throttle({ default: { limit: 720, ttl: 60_000 } })
  async signal(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ChatGroupCallSignalRequest,
  ): Promise<void> {
    await this.calls.signal(
      user.sub,
      id,
      body?.toUserId,
      body?.signal,
      body?.clientSignalId,
    );
  }

  @Get(':id/signals')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async signals(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Query('after') after?: string,
  ): Promise<ChatGroupCallSignalsResponse> {
    return {
      signals: await this.calls.signalsSince(
        user.sub,
        id,
        parseSignalsAfter(after),
      ),
    };
  }
}
