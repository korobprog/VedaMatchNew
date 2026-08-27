import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { OptionalAuthGuard, OptionalUser } from '../auth/auth.guard';
import { MusicCatalogService } from './music-catalog.service';
import {
  normalizeMusicTrackQuery,
  type RawQueryValue,
} from './music-catalog-query';
import { isAdmin } from './is-admin';

/**
 * Витрина Музыки. Как и Рынок, открыта гостю: страница записи должна
 * открываться по ссылке из поисковика и из мессенджера. Веб гейтит страницы
 * на вход сам, через `proxy.ts`, не трогая API.
 *
 * Аудио этим не раздаётся: файл уходит подписанной ссылкой из
 * `music/tracks/:id/stream` (этап 2), и она гостю не выдаётся.
 */
@Controller('music')
@UseGuards(OptionalAuthGuard)
export class MusicCatalogController {
  constructor(private readonly catalog: MusicCatalogService) {}

  @Get('catalog')
  showcase() {
    return this.catalog.showcase();
  }

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Get('tracks')
  tracks(
    @Query()
    query: Record<string, RawQueryValue>,
  ) {
    return this.catalog.listTracks(normalizeMusicTrackQuery(query));
  }

  @Get('tracks/:id')
  track(@Param('id') id: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.catalog.getTrack(
      id,
      user?.sub ?? null,
      user ? isAdmin(user) : false,
    );
  }

  @Get('artists/:slug')
  artist(@Param('slug') slug: string) {
    return this.catalog.getArtist(slug);
  }

  @Get('albums/:slug')
  album(@Param('slug') slug: string) {
    return this.catalog.getAlbum(slug);
  }
}
