import { Controller, Header, Sse, UseGuards } from '@nestjs/common';
import { map, merge, Observable, timer } from 'rxjs';
import type {
  AccessTokenPayload,
  ActivityStreamMessage,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ActivityEventsService } from './activity-events.service';

interface SseMessage {
  data: string;
  type?: string;
}

/**
 * Живой поток ленты друзей. Один на пользователя, устройство и heartbeat —
 * как у `chat-stream.controller.ts`: буферизующий прокси иначе копит поток
 * до заполнения буфера, и карточки приходят пачкой раз в минуту или не
 * приходят вовсе.
 */
@Controller('activity')
@UseGuards(AuthGuard)
export class ActivityStreamController {
  constructor(private readonly events: ActivityEventsService) {}

  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  stream(@CurrentUser() user: AccessTokenPayload): Observable<SseMessage> {
    const events = this.events.streamFor(user.sub).pipe(
      map((event: ActivityStreamMessage) => ({
        type: 'activity',
        data: JSON.stringify(event),
      })),
    );

    const heartbeat = timer(25_000, 25_000).pipe(
      map(() => ({ type: 'ping', data: '{}' })),
    );

    return merge(events, heartbeat);
  }
}
