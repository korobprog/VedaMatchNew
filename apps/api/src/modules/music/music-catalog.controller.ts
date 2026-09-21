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

  /**
   * Раздел «Аудиокниги» (VED-237). Отдельной выдачей, а не параметром
   * витрины: обычный каталог аудиокниг не показывает вовсе, и смешивать два
   * списка в одном ответе значило бы каждый раз объяснять, какой из них
   * сейчас нужен. Буквальный путь регистрируется до `tracks/:id` и `:slug`
   * по общему правилу Nest — здесь он и так выше них по файлу.
   */
  @Get('audiobooks')
  audiobooks(@OptionalUser() user?: AccessTokenPayload) {
    return this.catalog.audiobooks(user?.sub ?? null);
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

  @Get('artists/:slug')
  artist(@Param('slug') slug: string) {
    return this.catalog.getArtist(slug);
  }

  @Get('albums/:slug')
  album(@Param('slug') slug: string) {
    return this.catalog.getAlbum(slug);
  }
}
