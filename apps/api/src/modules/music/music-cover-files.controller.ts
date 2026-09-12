import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MusicCoversService } from './music-covers.service';
import { MUSIC_COVER_CACHE_CONTROL } from './music-cover-file';

/**
 * Отдача обложек. Отдельный контроллер от выдачи ссылок на заливку, потому что
 * охрана у них разная: залить может только участник, а посмотреть — кто
 * угодно, включая гостя на публичной странице.
 *
 * Путь совпадает с ключом объекта, поэтому адрес обложки остаётся постоянным:
 * кеш браузера и CDN работают как при прямой раздаче из хранилища.
 *
 * Лимит высокий: на экране каталога таких запросов десятки, и это нормальная
 * работа страницы, а не перебор.
 */
@Controller('music/covers')
@Throttle({ default: { ttl: 60_000, limit: 600 } })
export class MusicCoverFilesController {
  constructor(private readonly covers: MusicCoversService) {}

  @Get(':scope/:owner/:file')
  async file(
    @Param('scope') scope: string,
    @Param('owner') owner: string,
    @Param('file') file: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const cover = await this.covers.readCover({ scope, owner, file });
    // Нет объекта, чужой путь, выключенное хранилище — снаружи это одно и то
    // же: обложки по этому адресу нет.
    if (!cover) throw new NotFoundException('Обложка не найдена');

    response.set({
      'Content-Type': cover.contentType,
      'Cache-Control': MUSIC_COVER_CACHE_CONTROL,
    });
    return new StreamableFile(cover.stream);
  }
}
