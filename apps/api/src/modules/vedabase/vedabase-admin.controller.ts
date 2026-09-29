import {
  BadRequestException,
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
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  CompleteVedabaseBookUploadRequest,
  CreateVedabaseBookUploadRequest,
  VedabaseAdminBookPatch,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BookPatchError, parseBookPatch } from './book-admin-input';
import { ColoringInputError, parseColoring } from './coloring-input';
import { isAdmin } from './is-admin';
import { VedabaseAdminService } from './vedabase-admin.service';
import { VedabaseColoringService } from './vedabase-coloring.service';
import { VedabaseFilesService } from './vedabase-files.service';

/** Префикс под слагом сервиса, как требует контракт модуля. */
@Controller('vedabase/admin')
@UseGuards(AuthGuard)
export class VedabaseAdminController {
  constructor(
    private readonly admin: VedabaseAdminService,
    private readonly files: VedabaseFilesService,
    private readonly coloring: VedabaseColoringService,
  ) {}

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

  /** Файлы книги — и у заблокированной: админ видит всё. */
  @Get('books/:slug/files')
  bookFiles(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
  ) {
    this.assertAdmin(user);
    return this.files.forBook(slug, { includeBlocked: true });
  }

  @Post('books/:slug/files/upload')
  createUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() body: CreateVedabaseBookUploadRequest,
  ) {
    this.assertAdmin(user);
    return this.files.createUpload(slug, body);
  }

  @Post('books/:slug/files')
  completeUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() body: CompleteVedabaseBookUploadRequest,
  ) {
    this.assertAdmin(user);
    return this.files.complete(user.sub, slug, body);
  }

  @Delete('books/:slug/files/:fileId')
  @HttpCode(204)
  async removeFile(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Param('fileId') fileId: string,
  ) {
    this.assertAdmin(user);
    await this.files.remove(user.sub, slug, fileId);
  }

  /** Цветной перевод блока стиха (VED-683). */
  @Put('books/:slug/colors')
  saveColoring(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.assertAdmin(user);
    try {
      return this.coloring.save(user.sub, slug, parseColoring(body));
    } catch (error) {
      if (error instanceof ColoringInputError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
