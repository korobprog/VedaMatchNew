import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
// Общины и модерация — портальная инфраструктура, импортировать разрешено;
// сервисные модули — нет. См. docs/service-module-contract.md.
import { CommunitiesModule } from '../communities/communities.module';
import { ModerationModule } from '../moderation/moderation.module';
import {
  AdminVacanciesController,
  VacanciesController,
  VacanciesResponsesController,
} from './vacancies.controller';
import { VacanciesReportsService } from './vacancies-reports.service';
import { VacanciesResponsesService } from './vacancies-responses.service';
import { VacanciesService } from './vacancies.service';

/**
 * Сервис «Вакансии»: работа, служение и разовые задачи. Решение — VED-24.
 * Связь с Чатом, Уведомлениями и агендой Работы — только событиями
 * `vacancies.*`, см. vacancy-events.ts.
 */
@Module({
  imports: [AuthModule, CommunitiesModule, ModerationModule],
  // Порядок значим: у `VacanciesController` есть `@Get(':id')`, и он
  // перехватил бы `/vacancies/responses/mine`. Контроллер с буквальными
  // путями идёт первым.
  controllers: [
    VacanciesResponsesController,
    VacanciesController,
    AdminVacanciesController,
  ],
  providers: [
    VacanciesService,
    VacanciesResponsesService,
    VacanciesReportsService,
  ],
})
export class VacanciesModule {}
