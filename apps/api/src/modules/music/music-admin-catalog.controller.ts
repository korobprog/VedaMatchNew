import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMusicAlbumRequest,
  CreateMusicArtistRequest,
  CreateMusicCategoryRequest,
  UpdateMusicAlbumRequest,
  UpdateMusicArtistRequest,
  MusicModerationDecisionRequest,
  UpdateMusicCategoryRequest,
  UpdateMusicTrackRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicAdminQueueService } from './music-admin-queue.service';
import { isAdmin } from './is-admin';

/**
 * Префикс `music/admin`, а не `admin/...`: контракт сервисного модуля требует
 * держать все маршруты под слагом сервиса.
 */
@Controller('music/admin/catalog')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 120 } })
export class MusicAdminCatalogController {
  constructor(
    private readonly catalog: MusicAdminCatalogService,
    private readonly queue: MusicAdminQueueService,
  ) {}

  @Get('artists')
  listArtists(@CurrentUser() user: AccessTokenPayload) {
    return this.queue.listArtists(isAdmin(user));
  }

  @Get('albums')
  listAlbums(@CurrentUser() user: AccessTokenPayload) {
    return this.queue.listAlbums(isAdmin(user));
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AccessTokenPayload) {
    return this.queue.listCategories(isAdmin(user));
  }

  @Post('artists')
  createArtist(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicArtistRequest,
  ) {
    return this.catalog.createArtist(isAdmin(user), body);
  }

  @Patch('artists/:id')
  updateArtist(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicArtistRequest,
  ) {
    return this.catalog.updateArtist(isAdmin(user), id, body);
  }

  @Post('albums')
  createAlbum(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicAlbumRequest,
  ) {
    return this.catalog.createAlbum(isAdmin(user), body);
  }

  @Patch('albums/:id')
  updateAlbum(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicAlbumRequest,
  ) {
    return this.catalog.updateAlbum(isAdmin(user), id, body);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicCategoryRequest,
  ) {
    return this.catalog.createCategory(isAdmin(user), body);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicCategoryRequest,
  ) {
    return this.catalog.updateCategory(isAdmin(user), id, body);
  }

  @Delete('categories/:id')
  deleteCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteCategory(isAdmin(user), id);
  }

  @Patch('tracks/:id')
  updateTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicTrackRequest,
  ) {
    return this.catalog.updateTrack(isAdmin(user), id, body);
  }
}

/**
 * Очередь модерации и сводка раздела. Отдельным контроллером под своим
 * префиксом: `admin/catalog` — про справочники, `admin` — про решения.
 */
@Controller('music/admin')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 300 } })
export class MusicAdminQueueController {
  constructor(private readonly queue: MusicAdminQueueService) {}

  @Get('summary')
  summary(@CurrentUser() user: AccessTokenPayload) {
    return this.queue.summary(isAdmin(user));
  }

  @Get('queue')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.queue.queue(isAdmin(user));
  }

  @Post('queue/:trackId')
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('trackId') trackId: string,
    @Body() body: MusicModerationDecisionRequest,
  ) {
    return this.queue.decide(isAdmin(user), trackId, body);
  }
}
