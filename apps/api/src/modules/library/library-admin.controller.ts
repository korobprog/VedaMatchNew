import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  LibraryAdminEntryQuery,
  MergeLibraryCategoryRequest,
  SetLibraryCategoryLineageRequest,
  SetLibraryEntryLineageRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { LibraryAdminService } from './library-admin.service';

/**
 * Префикс `library/admin`, а не `admin/library`: контракт сервисного модуля
 * требует держать маршруты под слагом сервиса.
 */
@Controller('library/admin')
@UseGuards(AuthGuard)
export class LibraryAdminController {
  constructor(private readonly admin: LibraryAdminService) {}

  @Get('stats')
  stats(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.stats();
  }

  @Get('categories')
  categories(
    @CurrentUser() user: AccessTokenPayload,
    @Query('sectionId') sectionId?: string,
  ) {
    this.assertAdmin(user);
    return this.admin.listCategories(sectionId);
  }

  @Get('categories/duplicates')
  duplicates(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.duplicates();
  }

  @Post('categories/:id/merge')
  merge(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: MergeLibraryCategoryRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.mergeCategory(user.sub, id, body);
  }

  /** Линия автора (VED-548): запоминается у рубрики, материалы не трогает. */
  @Patch('categories/:id/lineage')
  setCategoryLineage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetLibraryCategoryLineageRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.setCategoryLineage(id, body);
  }

  /** «Применить ко всем материалам автора» — массовая правка, в журнал. */
  @Post('categories/:id/lineage/apply')
  applyAuthorLineage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.admin.applyAuthorLineage(user.sub, id);
  }

  /** Кнопка «Линия» на карточке и странице материала (VED-561). */
  @Patch('entries/:id/lineage')
  setEntryLineage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetLibraryEntryLineageRequest,
  ) {
    this.assertAdmin(user);
    return this.admin.setEntryLineage(id, body);
  }

  @Get('entries')
  entries(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: LibraryAdminEntryQuery & { notEnrichedOnly?: string },
  ) {
    this.assertAdmin(user);
    return this.admin.listEntries({
      ...query,
      notEnrichedOnly: query.notEnrichedOnly === 'true',
    });
  }

  @Post('entries/:id/remove')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    this.assertAdmin(user);
    return this.admin.setEntryStatus(user.sub, id, true);
  }

  @Post('entries/:id/restore')
  restore(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    this.assertAdmin(user);
    return this.admin.setEntryStatus(user.sub, id, false);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
