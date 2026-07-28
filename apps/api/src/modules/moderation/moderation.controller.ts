import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AdminUpdateUserReportRequest,
  CreateUserReportRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ModerationService } from './moderation.service';

@Controller('union')
@UseGuards(AuthGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('blocks')
  blocks(@CurrentUser() user: AccessTokenPayload) {
    return this.moderation.listBlocks(user.sub);
  }

  @Post('users/:id/block')
  block(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moderation.block(user.sub, id);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moderation.unblock(user.sub, id);
  }

  // Жалобы дешевле спамить, чем разбирать: ограничиваем частоту отправки.
  @Post('users/:id/report')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateUserReportRequest,
  ) {
    return this.moderation.report(user.sub, id, body);
  }
}

@Controller('admin/reports')
@UseGuards(AuthGuard)
export class AdminModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.moderation.adminList(user.role, status);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminUpdateUserReportRequest,
  ) {
    return this.moderation.adminUpdate(user, id, body);
  }
}
