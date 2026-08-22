import { Controller, Sse, UseGuards } from '@nestjs/common';
import { map, merge, Observable, timer } from 'rxjs';
import type { AccessTokenPayload, ChatStreamEvent } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ChatEventsService } from './chat-events.service';

interface SseMessage {
  data: string;
  type?: string;
}

/**
 * Поток событий чата. Один на пользователя, а не на беседу: держать по
 * соединению на каждый открытый диалог означает упереться в лимит
 * одновременных запросов браузера на шестом чате.
 */
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatStreamController {
  constructor(private readonly events: ChatEventsService) {}

  @Sse('stream')
  stream(@CurrentUser() user: AccessTokenPayload): Observable<SseMessage> {
    const events = this.events.streamFor(user.sub).pipe(
      map((event: ChatStreamEvent) => ({
        type: 'chat',
        data: JSON.stringify(event),
      })),
    );

    // Пустой тик раз в 25 секунд: прокси и мобильные сети рвут молчащее
    // соединение раньше, чем в чат придёт следующее сообщение.
    const heartbeat = timer(25_000, 25_000).pipe(
      map(() => ({ type: 'ping', data: '{}' })),
    );

    return merge(events, heartbeat);
  }
}
