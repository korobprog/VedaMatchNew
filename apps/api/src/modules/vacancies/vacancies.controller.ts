import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AdminVacancyOfferActionRequest,
  AdminVacancyOffersFilters,
  AdminVacancyReportDecisionRequest,
  CreateVacancyOfferRequest,
  CreateVacancyReportRequest,
  CreateVacancyResponseRequest,
  UpdateVacancyOfferRequest,
  UpdateVacancyResponseStatusRequest,
  UpdateVacancyStatusRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { parseFeedFilters } from './vacancy-feed-query';
import { VacanciesAdminService } from './vacancies-admin.service';
import { VacanciesReportsService } from './vacancies-reports.service';
import { VacanciesResponsesService } from './vacancies-responses.service';
import { VacanciesService } from './vacancies.service';

/**
 * Отклики и жалобы. Отдельный контроллер и регистрируется первым: у
 * `VacanciesController` есть `@Get(':id')`, который перехватил бы
 * `/vacancies/responses/mine`. См. порядок в vacancies.module.ts.
 */
@Controller('vacancies')
export class VacanciesResponsesController {
  constructor(
    private readonly responses: VacanciesResponsesService,
    private readonly reports: VacanciesReportsService,
  ) {}

  @Get('responses/mine')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.responses.listMine(user.sub);
  }

  @Post('responses/:responseId/status')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setResponseStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('responseId') responseId: string,
    @Body() body: UpdateVacancyResponseStatusRequest,
  ) {
    return this.responses.setStatus(user.sub, responseId, body);
  }

  @Delete('responses/:responseId')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  withdraw(
    @CurrentUser() user: AccessTokenPayload,
    @Param('responseId') responseId: string,
  ) {
    return this.responses.withdraw(user.sub, responseId);
  }

  @Get(':id/responses')
  @UseGuards(AuthGuard)
  listForOffer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.responses.listForOffer(user.sub, isAdmin(user), id);
  }

  @Post(':id/responses')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  createResponse(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateVacancyResponseRequest,
  ) {
    return this.responses.create(user.sub, id, body ?? {});
  }

  @Post(':id/report')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 20 } })
  report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateVacancyReportRequest,
  ) {
    return this.reports.report(user.sub, id, body);
  }
}

@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly offers: VacanciesService) {}

  // Лента гостю не открыта, как и доска Объявлений: предложение общины —
  // внутренняя жизнь, а не витрина. Лимит чтения послаблен: фильтры
  // переключают часто.
  @Get()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  feed(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.offers.feed(parseFeedFilters(query), user.sub, isAdmin(user));
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  byId(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.offers.byId(id, user.sub, isAdmin(user));
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateVacancyOfferRequest,
  ) {
    return this.offers.create(user.sub, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateVacancyOfferRequest,
  ) {
    return this.offers.update(user.sub, isAdmin(user), id, body);
  }

  @Post(':id/status')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateVacancyStatusRequest,
  ) {
    return this.offers.setStatus(user.sub, isAdmin(user), id, body);
  }

  @Post(':id/renew')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 30 } })
  renew(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.offers.renew(user.sub, id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.offers.remove(user.sub, isAdmin(user), id);
  }
}

/** Админка: жалобы, список предложений, действия и статистика. */
@Controller('admin/vacancies')
@UseGuards(AuthGuard)
export class AdminVacanciesController {
  constructor(
    private readonly reports: VacanciesReportsService,
    private readonly admin: VacanciesAdminService,
  ) {}

  @Get('reports')
  listReports(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    this.assertAdmin(user);
    return this.reports.adminList(status);
  }

  @Post('reports/:id/decide')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminVacancyReportDecisionRequest,
  ) {
    this.assertAdmin(user);
    return this.reports.decide(user.sub, id, body);
  }

  @Get('stats')
  stats(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.stats();
  }

  @Get()
  listOffers(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, string | undefined>,
  ) {
    this.assertAdmin(user);
    // Значения проверяет сервис: незнакомый вид или статус просто не
    // сужают список.
    return this.admin.list({
      kind: query.kind as AdminVacancyOffersFilters['kind'],
      status: query.status as AdminVacancyOffersFilters['status'],
      q: query.q,
    });
  }

  @Post(':id/action')
  @HttpCode(200)
  act(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminVacancyOfferActionRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.act(user.sub, id, body);
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
  }
}
