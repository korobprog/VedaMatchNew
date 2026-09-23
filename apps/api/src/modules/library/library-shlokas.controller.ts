import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  LIBRARY_SHLOKA_LIMITS,
  type AccessTokenPayload,
  type CreateLibraryShlokaRequest,
  type UpdateLibraryShlokaRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminUnlimited } from '../auth/admin-unlimited.guard';
import {
  LibraryShlokasService,
  type UploadedShlokaImage,
} from './library-shlokas.service';
import { isAdmin } from './is-admin';

/**
 * Шлоки Образования (VED-386). Удаление — общим `DELETE library/entries/:id`:
 * шлока — материал, и снимается как материал, вместе с картинками.
 */
@Controller('library/shlokas')
@UseGuards(AuthGuard)
export class LibraryShlokasController {
  constructor(private readonly shlokas: LibraryShlokasService) {}

  /** Окно источника: `?category=<slug>&q=<поиск>&offset=<смещение>`. */
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  list(
    @Query('category') category: string | undefined,
    @Query('q') query: string | undefined,
    @Query('offset') offset: string | undefined,
  ) {
    return this.shlokas.list(category ?? '', query, offset);
  }

  @Get(':id')
  byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.shlokas.byId(id, user.sub, isAdmin(user));
  }

  /** Лимит — как у материалов; админ наполняет источники пачками. */
  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @AdminUnlimited('library')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryShlokaRequest,
  ) {
    return this.shlokas.create(user.sub, isAdmin(user), body);
  }

  @Patch(':id')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibraryShlokaRequest,
  ) {
    return this.shlokas.update(user.sub, isAdmin(user), id, body);
  }

  /** Картинка шлоки; с `acharyaId` в форме — картинка блока ачарьи. */
  @Post(':id/images')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @AdminUnlimited('library')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: LIBRARY_SHLOKA_LIMITS.imageBytes },
    }),
  )
  addImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body('acharyaId') acharyaId: unknown,
    @UploadedFile() file?: UploadedShlokaImage,
  ) {
    return this.shlokas.addImage(user.sub, isAdmin(user), id, file, acharyaId);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(204)
  removeImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.shlokas.removeImage(user.sub, isAdmin(user), id, imageId);
  }
}
