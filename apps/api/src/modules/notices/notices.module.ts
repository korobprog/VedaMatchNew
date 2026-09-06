import { Module } from '@nestjs/common';
import { NoticesAssistantListener } from './notices-assistant.listener';
import { AuthModule } from '../auth/auth.module';
// Общины — портальная инфраструктура наравне с ModerationModule, её
// импортировать разрешено; сервисные модули — нет.
// См. docs/service-module-contract.md.
import { CommunitiesModule } from '../communities/communities.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NoticeImagesService } from './notice-images.service';
import {
  AdminNoticesController,
  NoticesController,
  NoticesResponsesController,
} from './notices.controller';
import { NoticesPurgeListener } from './notices-purge.listener';
import { NoticesReportsService } from './notices-reports.service';
import { NoticesResponsesService } from './notices-responses.service';
import { NoticesSubscriptionsService } from './notices-subscriptions.service';
import { NoticesService } from './notices.service';
import { NoticesWorkerService } from './notices-worker.service';

@Module({
  imports: [AuthModule, CommunitiesModule, ModerationModule],
  // Порядок значим. У `NoticesController` есть `@Get(':id')` — один сегмент,
  // и он перехватил бы `/notices/subscriptions`. Nest сопоставляет маршруты
  // в порядке регистрации, поэтому контроллер с буквальными путями идёт
  // первым. Менять порядок нельзя, не проверив маршруты руками.
  controllers: [
    NoticesResponsesController,
    NoticesController,
    AdminNoticesController,
  ],
  providers: [
    NoticesService,
    NoticeImagesService,
    NoticesResponsesService,
    NoticesReportsService,
    NoticesSubscriptionsService,
    NoticesWorkerService,
    NoticesPurgeListener,
    NoticesAssistantListener,
  ],
})
export class NoticesModule {}
