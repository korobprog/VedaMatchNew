import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AdminChatReportDecisionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ChatSignedUrlsInterceptor } from './chat-signed-urls.interceptor';
import { ChatReportsService } from './chat-reports.service';
import { isAdmin } from './is-admin';

/**
 * Раздел админки сервиса. Сервис не считается готовым, пока им нельзя
 * управлять из /admin: жалобы, статистика, разбор конкретной беседы.
 */
@Controller('admin/chat')
@UseGuards(AuthGuard)
@UseInterceptors(ChatSignedUrlsInterceptor)
export class ChatAdminController {
  constructor(private readonly reports: ChatReportsService) {}

  @Get('reports')
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    this.assertAdmin(user);
    return this.reports.adminList(status);
  }

  @Post('reports/:id/decide')
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminChatReportDecisionRequest,
  ) {
    this.assertAdmin(user);
    return this.reports.decide(user.sub, id, body);
  }

  @Get('conversations')
  conversations(
    @CurrentUser() user: AccessTokenPayload,
    @Query('q') query?: string,
  ) {
    this.assertAdmin(user);
    return this.reports.adminConversations(query);
  }

  @Post('conversations/:id/freeze')
  freeze(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { frozen?: boolean },
  ) {
    this.assertAdmin(user);
    return this.reports.freezeConversation(id, body?.frozen !== false);
  }

  /** Переписка двоих для разбора жалобы: пара людей, а не id беседы. */
  @Get('direct-transcript')
  transcript(
    @CurrentUser() user: AccessTokenPayload,
    @Query('a') a: string,
    @Query('b') b: string,
  ) {
    if (!isAdmin(user)) throw new ForbiddenException('Недостаточно прав');
    return this.reports.adminDirectTranscript(user.sub, a ?? '', b ?? '');
  }

  @Get('stats')
  stats(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.reports.stats();
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Недостаточно прав');
  }
}
