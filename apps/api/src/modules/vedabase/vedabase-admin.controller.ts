import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  VedabaseAdminBookPatch,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BookPatchError, parseBookPatch } from './book-admin-input';
import { isAdmin } from './is-admin';
import { VedabaseAdminService } from './vedabase-admin.service';

/** Префикс под слагом сервиса, как требует контракт модуля. */
@Controller('vedabase/admin')
@UseGuards(AuthGuard)
export class VedabaseAdminController {
  constructor(private readonly admin: VedabaseAdminService) {}

  @Get('books')
  books(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.listBooks();
  }

  @Patch('books/:slug')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.assertAdmin(user);
    let patch: VedabaseAdminBookPatch;
    try {
      patch = parseBookPatch(body);
    } catch (error) {
      if (error instanceof BookPatchError)
        throw new BadRequestException(error.message);
      throw error;
    }
    return this.admin.updateBook(user.sub, slug, patch);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
