import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkBoardsService } from './work-boards.service';
import { WorkContactsService } from './work-contacts.service';
import { WorkFinanceService } from './work-finance.service';
import { WorkPayoutWorkerService } from './work-payout-worker.service';
import { WorkPayoutsService } from './work-payouts.service';
import { WorkInvitesService } from './work-invites.service';
import { WorkNoticeWorkerService } from './work-notice-worker.service';
import { WorkNoticesService } from './work-notices.service';
import { WorkPurgeListener } from './work-purge.listener';
import { WorkSpacesService } from './work-spaces.service';
import { WorkTasksService } from './work-tasks.service';
import { WorkUploadsService } from './work-uploads.service';
import { WorkTravelListener } from './work-travel.listener';
import { WorkVacanciesListener } from './work-vacancies.listener';
import {
  WorkActController,
  WorkBoardsController,
  WorkController,
  WorkFinanceController,
  WorkInvitesController,
  WorkTasksController,
} from './work.controller';

/**
 * Сервис «Работа». См. docs/work-service-plan.md.
 *
 * Порядок контроллеров значим: у `WorkController` есть `@Get('spaces/:id')`, и
 * он перехватил бы буквальные пути соседей. Nest сопоставляет маршруты в
 * порядке регистрации — менять порядок нельзя, не проверив маршруты руками.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    WorkInvitesController,
    WorkActController,
    WorkController,
    WorkBoardsController,
    WorkTasksController,
    WorkFinanceController,
  ],
  providers: [
    WorkSpacesService,
    WorkBoardsService,
    WorkTasksService,
    WorkFinanceService,
    WorkPayoutsService,
    WorkPayoutWorkerService,
    WorkInvitesService,
    WorkContactsService,
    WorkUploadsService,
    WorkNoticesService,
    WorkNoticeWorkerService,
    WorkPurgeListener,
    WorkVacanciesListener,
    WorkTravelListener,
  ],
})
export class WorkModule {}
