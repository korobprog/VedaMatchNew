import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ChatAdminController } from './chat-admin.controller';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatEventsService } from './chat-events.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatPurgeListener } from './chat-purge.listener';
import { ChatReportsService } from './chat-reports.service';
import { ChatSignedUrlsInterceptor } from './chat-signed-urls.interceptor';
import { ChatStreamController } from './chat-stream.controller';
import { ChatUploadsService } from './chat-uploads.service';
import { ChatController } from './chat.controller';
import { PeopleAdminController } from './people/people-admin.controller';
import { PeopleAdminService } from './people/people-admin.service';
import { PeopleAvatarService } from './people/people-avatar.service';
import { PeopleController } from './people/people.controller';
import { PeopleRequestsService } from './people/people-requests.service';
import { PeopleService } from './people/people.service';

/**
 * Сервис «Общение»: беседы и справочник людей (папка `people/` — бывший
 * сервис «Контакты»).
 *
 * По контракту сервисного модуля фичевые модули не импортируются — в том
 * числе Знакомства, чей чат сюда переехал миграцией. ModerationModule
 * импортируется как портальная инфраструктура наравне с AuthModule: блокировки
 * и скрытия сквозные, и своя копия таблицы скрытий означала бы, что «скрыть
 * человека» перестало работать в остальном портале. Аватары и возраст —
 * свои копии внутри модуля, а не импорт из `users/`.
 */
@Module({
  imports: [AuthModule, ModerationModule],
  controllers: [
    ChatController,
    ChatStreamController,
    ChatAdminController,
    PeopleController,
    PeopleAdminController,
  ],
  providers: [
    ChatConversationsService,
    ChatMessagesService,
    ChatReportsService,
    ChatEventsService,
    ChatUploadsService,
    ChatSignedUrlsInterceptor,
    ChatPurgeListener,
    PeopleService,
    PeopleRequestsService,
    PeopleAdminService,
    PeopleAvatarService,
  ],
})
export class ChatModule {}
