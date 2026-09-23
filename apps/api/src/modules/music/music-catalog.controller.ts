import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { OptionalAuthGuard, OptionalUser } from '../auth/auth.guard';
import { MusicAudiobooksService } from './music-audiobooks.service';
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
  constructor(
    private readonly catalog: MusicCatalogService,
    private readonly audiobooks: MusicAudiobooksService,
  ) {}

  /**
   * Витрина и поиск знают, кто смотрит: преданный видит записи своей
   * духовной линии, гость и остальные — весь каталог. Страница записи,
   * исполнителя и альбома не фильтруются — прямая ссылка обязана открываться.
   */
  @Get('catalog')
  showcase(
    @Query('root') root?: string,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.catalog.showcase(user?.sub ?? null, root?.trim() || null);
  }

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Get('tracks')
  tracks(
    @Query()
    query: Record<string, RawQueryValue>,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.catalog.listTracks(
      normalizeMusicTrackQuery(query),
      user?.sub ?? null,
    );
  }

  @Get('tracks/:id')
  track(@Param('id') id: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.catalog.getTrack(
      id,
      user?.sub ?? null,
      user ? isAdmin(user) : false,
    );
  }

  /**
   * Страница исполнителя. Книги в его чтении (VED-297) дочитываются здесь,
   * а не в `getArtist`: это другой сервис модуля, и витрине они не нужны.
   */
  @Get('artists/:slug')
  async artist(@Param('slug') slug: string) {
    const page = await this.catalog.getArtist(slug);
    const audiobooks = await this.audiobooks.byReader(page.artist.id);
    return { ...page, audiobooks };
  }

  @Get('albums/:slug')
  album(@Param('slug') slug: string) {
    return this.catalog.getAlbum(slug);
  }
}
