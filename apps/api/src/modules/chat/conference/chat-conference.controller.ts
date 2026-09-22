import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  ChatConferenceDto,
  ChatConferenceInviteDto,
  CreateChatConferenceRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../../auth/auth.guard';
import { ChatConferenceService } from './chat-conference.service';
import { normalizeConferenceToken } from './conference-link';

/**
 * Быстрая конференция по ссылке (VED-360).
 *
 * Карточка приглашения (`GET links/:token`) — единственный маршрут сервиса,
 * открытый гостю: её обязан прочитать человек без аккаунта, иначе ссылка
 * приводит на страницу входа, ничего не говорящую о том, куда зовут. Всё
 * остальное — за входом: анонимов в комнату не пускаем осознанно, портал
 * общается по именам.
 *
 * Порядок маршрутов не косметика: `links/:token` обязан стоять ВЫШЕ
 * `:conversationId`, иначе Express отдаст токен в обработчик комнаты.
 * Сторожит `chat-conference-route-order.spec.ts`.
 */
@Controller('chat/conference')
export class ChatConferenceController {
  constructor(private readonly conference: ChatConferenceService) {}

  /**
   * Карточка приглашения: кто зовёт, сколько мест и можно ли войти. Гостю
   * тоже. Лимит щедрый — ссылку открывают из мессенджера, где предпросмотр
   * дёргает адрес сам, но не настолько, чтобы токены перебирали.
   */
  @Get('links/:token')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  invite(
    @Param('token') token: string,
    @OptionalUser() user?: AccessTokenPayload,
  ): Promise<ChatConferenceInviteDto> {
    return this.conference.invite(requireToken(token), user?.sub ?? null);
  }

  /** Войти по ссылке. Ответ — комната: клиенту остаётся её открыть. */
  @Post('links/:token/join')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('token') token: string,
  ): Promise<ChatConferenceDto> {
    return this.conference.join(requireToken(token), user.sub);
  }

  /** Завести конференцию и получить ссылку. */
  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body?: CreateChatConferenceRequest,
  ): Promise<ChatConferenceDto> {
    return this.conference.create(user.sub, body ?? {});
  }

  /** Своя ссылка: скопировать ещё раз посреди разговора. */
  @Get(':conversationId')
  @UseGuards(AuthGuard)
  room(
    @CurrentUser() user: AccessTokenPayload,
    @Param('conversationId') conversationId: string,
  ): Promise<ChatConferenceDto> {
    return this.conference.forConversation(conversationId, user.sub);
  }

  /** Закрыть вход по ссылке. Тех, кто внутри, это не выставляет. */
  @Post(':conversationId/revoke')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('conversationId') conversationId: string,
  ): Promise<ChatConferenceDto> {
    return this.conference.revoke(conversationId, user.sub);
  }

  /** Выдать новую ссылку взамен прежней — прежняя перестаёт работать. */
  @Post(':conversationId/link')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  rotate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('conversationId') conversationId: string,
  ): Promise<ChatConferenceDto> {
    return this.conference.rotate(conversationId, user.sub);
  }
}

/**
 * Токен проверяется по форме до базы: мусор из адресной строки не должен
 * доходить до запроса, а ответ на кривой токен обязан быть таким же, как на
 * несуществующий, — чтобы перебор ничего не рассказывал.
 */
function requireToken(value: string): string {
  const token = normalizeConferenceToken(value);
  if (!token) throw new NotFoundException('Такой конференции нет');
  return token;
}
