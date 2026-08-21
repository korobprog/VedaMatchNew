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
import type {
  AccessTokenPayload,
  ContactsAdminHideRequest,
  ContactsAdminProfileQuery,
  CreateContactsTagRequest,
  UpdateContactsTagRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ContactsAdminService } from './contacts-admin.service';
import { isAdmin } from './is-admin';

/**
 * Префикс `contacts/admin`, а не `admin/contacts`: контракт сервисного модуля
 * требует держать маршруты под слагом сервиса.
 */
@Controller('contacts/admin')
@UseGuards(AuthGuard)
export class ContactsAdminController {
  constructor(private readonly admin: ContactsAdminService) {}

  @Get('stats')
  stats(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.stats();
  }

  @Get('tags')
  tags(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.listTags();
  }

  @Post('tags')
  createTag(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateContactsTagRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.createTag(user.sub, body);
  }

  @Patch('tags/:id')
  updateTag(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateContactsTagRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.updateTag(user.sub, id, body);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  async deleteTag(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.admin.deleteTag(user.sub, id);
  }

  @Get('profiles')
  profiles(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ContactsAdminProfileQuery & { hiddenOnly?: string },
  ) {
    this.assertAdmin(user);
    return this.admin.listProfiles({
      ...query,
      hiddenOnly: query.hiddenOnly === 'true',
    });
  }

  @Post('profiles/:userId/hide')
  hide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
    @Body() body: ContactsAdminHideRequest,
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
