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
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  MAX_IMAGES_PER_NOTICE,
  type AccessTokenPayload,
  type AdminNoticeReportDecisionRequest,
  type CreateNoticeReportRequest,
  type CreateNoticeRequest,
  type CreateNoticeResponseRequest,
  type CreateNoticeSubscriptionRequest,
  type CreateNoticeThanksRequest,
  type ReorderNoticeImagesRequest,
  type RespondToNoticeResponseRequest,
  type UpdateNoticeRequest,
  type UpdateNoticeStatusRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import {
  MAX_UPLOAD_BYTES,
  type UploadedImageFile,
} from './notice-images.service';
import { parseFeedFilters } from './notice-feed-query';
import { NoticesReportsService } from './notices-reports.service';
import { NoticesResponsesService } from './notices-responses.service';
import { NoticesSubscriptionsService } from './notices-subscriptions.service';
import { NoticesService } from './notices.service';

@Controller('notices')
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly config: ConfigService,
  ) {}

  // Рубрики публичны и не меняются: отдельного лимита им не нужно.
  @Get('rubrics')
  rubrics() {
    return this.notices.rubrics();
  }

  // Доска — внутренняя жизнь общины, а не витрина: гостю не открыта ни
  // лента, ни карта, ни карточка (см. docs/notices-service-plan.md, «Гостю
  // лента не открыта»). Публичны только рубрики выше.
  //
  // Лента живёт под послабленным лимитом чтения: фильтры на доске
  // переключают часто, и час бана за перебор рубрик был бы абсурдом.
  @Get()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async feed(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const filters = parseFeedFilters(query);
    filters.radiusIds = await this.notices.resolveRadius(query);
    return this.notices.feed(filters, user.sub, isAdmin(user));
  }

  // Карту двигают чаще, чем переключают фильтры: лимит выше, чем у ленты.
  @Get('map')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async map(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const filters = parseFeedFilters(query);
    filters.radiusIds = await this.notices.resolveRadius(query);
    return this.notices.map(filters, query, user.sub, isAdmin(user));
  }

  // Календарь: события окна с развёрнутыми повторами.
  @Get('events')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  events(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.notices.calendar(
      parseFeedFilters(query),
      query,
      user.sub,
      isAdmin(user),
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  byId(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.notices.byId(id, user.sub, isAdmin(user));
  }

  /**
   * Экспорт события в календарь телефона. Отдаётся файлом: `text/calendar`
   * с `attachment`, иначе браузер покажет его текстом. Ссылка открывается
   * прямым переходом из афиши, cookie при этом уходит — гвард тот же.
   */
  @Get(':id/ics')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  async ics(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const body = await this.notices.ics(
      id,
      user.sub,
      isAdmin(user),
      this.config.get<string>('WEB_PUBLIC_URL') ?? 'https://vedamatch.ru',
    );
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vedamatch-${id}.ics"`,
    );
    return body;
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateNoticeRequest,
  ) {
    return this.notices.create(user.sub, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateNoticeRequest,
  ) {
    return this.notices.update(user.sub, isAdmin(user), id, body);
  }

  // Смена статуса — действие, а не правка полей, поэтому POST.
  @Post(':id/status')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateNoticeStatusRequest,
  ) {
    return this.notices.setStatus(user.sub, isAdmin(user), id, body);
  }

  @Post(':id/renew')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 30 } })
  renew(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.notices.renew(user.sub, id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.notices.remove(user.sub, isAdmin(user), id);
  }

  @Post(':id/images')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_NOTICE, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadImages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFiles() files?: UploadedImageFile[],
  ) {
    return this.notices.uploadImages(user.sub, isAdmin(user), id, files ?? []);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  removeImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.notices.removeImage(user.sub, isAdmin(user), id, imageId);
  }

  @Put(':id/images/order')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  reorderImages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ReorderNoticeImagesRequest,
  ) {
    return this.notices.reorderImages(user.sub, isAdmin(user), id, body);
  }
}

/**
 * Отклики, благодарности и жалобы. Отдельный контроллер: у объявлений и у
 * связи между людьми разные правила доступа, и держать их в одном файле
 * значит перепутать их при первой же правке.
 */
@Controller('notices')
export class NoticesResponsesController {
  constructor(
    private readonly responses: NoticesResponsesService,
    private readonly reports: NoticesReportsService,
    private readonly subscriptions: NoticesSubscriptionsService,
  ) {}

  // Списки — до `:id/...`, иначе `responses` уедет в параметр объявления.
  @Get('responses/mine')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.responses.listMine(user.sub);
  }

  @Post('responses/:responseId/respond')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  respond(
    @CurrentUser() user: AccessTokenPayload,
    @Param('responseId') responseId: string,
    @Body() body: RespondToNoticeResponseRequest,
  ) {
    return this.responses.respond(user.sub, responseId, body.accept);
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

  @Get('subscriptions')
  @UseGuards(AuthGuard)
  listSubscriptions(@CurrentUser() user: AccessTokenPayload) {
    return this.subscriptions.list(user.sub);
  }

  @Post('subscriptions')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  subscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateNoticeSubscriptionRequest,
  ) {
    return this.subscriptions.subscribe(user.sub, body);
  }

  @Delete('subscriptions/:subscriptionId')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  unsubscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.subscriptions.unsubscribe(user.sub, subscriptionId);
  }

  @Get('karma/:userId')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 300 } })
  karma(@Param('userId') userId: string) {
    return this.responses.karma(userId);
  }

  @Get(':id/responses')
  @UseGuards(AuthGuard)
  listForNotice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.responses.listForNotice(user.sub, isAdmin(user), id);
  }

  @Post(':id/responses')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  createResponse(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateNoticeResponseRequest,
  ) {
    return this.responses.create(user.sub, id, body ?? {});
  }

  @Post(':id/thanks')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 30 } })
  thank(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateNoticeThanksRequest,
  ) {
    return this.responses.thank(user.sub, id, body);
  }

  /**
   * Скрытие объявления администрацией общины. Делегирование, без которого
   * доска упирается в портальную администрацию.
   */
  @Post(':id/community-hide')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  communityHide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { moderatorNote?: string | null },
  ) {
    return this.reports.communityHide(
      user.sub,
      id,
      body?.moderatorNote ?? null,
    );
  }

  // Жалобы дешевле спамить, чем разбирать: ограничиваем частоту.
  @Post(':id/report')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 20 } })
  report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateNoticeReportRequest,
  ) {
    return this.reports.report(user.sub, id, body);
  }
}

/** Разбор жалоб администрацией портала. */
@Controller('admin/notices/reports')
@UseGuards(AuthGuard)
export class AdminNoticesController {
  constructor(private readonly reports: NoticesReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    this.assertAdmin(user);
    return this.reports.adminList(status);
  }

  @Post(':id/decide')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminNoticeReportDecisionRequest,
  ) {
    this.assertAdmin(user);
    return this.reports.decide(user.sub, id, body);
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
  }
}
