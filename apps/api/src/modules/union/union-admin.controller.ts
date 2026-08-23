import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  UnionAdminHideProfileRequest,
  UnionAdminProfileQuery,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { UnionAdminService } from './union-admin.service';

/**
 * Префикс `union/admin`, а не `admin/union`: контракт сервисного модуля требует
 * держать все маршруты под слагом сервиса — так же, как у Рынка.
 */
@Controller('union/admin')
@UseGuards(AuthGuard)
export class UnionAdminController {
  constructor(private readonly admin: UnionAdminService) {}

  @Get('stats')
  stats(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.stats();
  }

  @Get('profiles')
  profiles(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: UnionAdminProfileQuery & { reportedOnly?: string },
  ) {
    this.assertAdmin(user);
    // Query приходит строками: «reportedOnly=true» иначе стало бы истиной
    // в любом виде, включая «false».
    return this.admin.listProfiles({
      ...query,
      reportedOnly: query.reportedOnly === 'true',
    });
  }

  @Get('profiles/:userId')
  profile(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    this.assertAdmin(user);
    return this.admin.profile(userId);
  }

  @Post('profiles/:userId/hide')
  hide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
    @Body() body: UnionAdminHideProfileRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.hideProfile(user.sub, userId, body);
  }

  @Post('profiles/:userId/restore')
  restore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    this.assertAdmin(user);
    return this.admin.restoreProfile(user.sub, userId);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
