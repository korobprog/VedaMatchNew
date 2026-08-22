import { Controller, Header, Sse, UseGuards } from '@nestjs/common';
import { from, map, merge, mergeMap, Observable, timer } from 'rxjs';
import type { AccessTokenPayload, ChatStreamEvent } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ChatEventsService } from './chat-events.service';
import { ChatSignedUrlsInterceptor } from './chat-signed-urls.interceptor';

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
  constructor(
    private readonly events: ChatEventsService,
    private readonly signer: ChatSignedUrlsInterceptor,
  ) {}

  /**
   * `X-Accel-Buffering: no` и `no-transform` — не украшение: буферизующий
   * прокси копит поток до заполнения буфера, и сообщения приходят пачкой
   * через минуту либо не приходят вовсе. Заголовки просят nginx и его родню
   * пропускать события как есть; gzip на потоке даёт тот же эффект.
   */
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  stream(@CurrentUser() user: AccessTokenPayload): Observable<SseMessage> {
    // Ссылки на файлы подписываются и здесь: сообщение с фотографией
    // приходит живым потоком, и прямой адрес закрытого бакета в нём отвечал
    // бы 403 ровно так же, как в ленте.
    const events = this.events.streamFor(user.sub).pipe(
      mergeMap((event: ChatStreamEvent) => from(this.signer.sign(event))),
      map((event) => ({ type: 'chat', data: JSON.stringify(event) })),
    );

    // Пустой тик раз в 25 секунд: прокси и мобильные сети рвут молчащее
    // соединение раньше, чем в чат придёт следующее сообщение.
    const heartbeat = timer(25_000, 25_000).pipe(
      map(() => ({ type: 'ping', data: '{}' })),
    );

    return merge(events, heartbeat);
  }
}
