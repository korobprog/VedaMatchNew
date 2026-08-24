import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityAvatarService } from './activity-avatar.service';
import { ActivityController } from './activity.controller';
import { ActivityEventsService } from './activity-events.service';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFollowsListener } from './activity-follows.listener';
import { ActivityItemsListener } from './activity-items.listener';
import { ActivityStreamController } from './activity-stream.controller';

/**
 * Сервис «Лента друзей». По контракту сервисного модуля импортирует только
 * AuthModule; PrismaService глобальный, EventEmitter2 инжектится напрямую.
 * Не публикуется в каталоге сервисов (`prisma/seed.ts`) — как `chat`,
 * `notifications` и `rewards`, это портальная инфраструктура без своей
 * плитки в сетке, а не отдельный раздел, который открывают по ссылке.
 */
@Module({
  imports: [AuthModule],
  controllers: [ActivityController, ActivityStreamController],
  providers: [
    ActivityAvatarService,
    ActivityEventsService,
    ActivityFeedService,
    ActivityFollowsListener,
    ActivityItemsListener,
  ],
})
export class ActivityModule {}
