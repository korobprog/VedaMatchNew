import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MusicTrackStreamUrlDto,
} from '@vedamatch/shared';
import { MUSIC_STREAM_URL_TTL_SECONDS } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicStorageService } from './music-storage.service';
import { isAdmin } from './is-admin';
import {
  attachmentDisposition,
  musicDownloadFileName,
} from './music-download-name';

/**
 * Отдача аудио.
 *
 * Отдельным контроллером, а не рядом с каталогом, ровно из-за guard'а:
 * каталог открыт гостю, а звук — нет. Публичная витрина нужна, чтобы ссылку
 * на запись можно было переслать; выкачать по ней каталог — нельзя.
 *
 * Ответ — 302 на подписанную ссылку, а не поток через API. Так раздачей
 * занимается S3: диапазонные запросы, перемотка и докачка достаются
 * бесплатно, а процесс Nest не держит соединение на всё время
 * прослушивания.
 */
@Controller('music/tracks')
@UseGuards(AuthGuard)
export class MusicStreamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
  ) {}

  @Get(':id/stream')
  @Redirect()
  async stream(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    const url = await this.resolveUrl(user, id);

    // 302, а не 301: ссылка живёт шесть часов, и закешировать её навсегда
    // означает отдать протухший адрес завтра.
    return { url, statusCode: 302 };
  }

  /**
   * Тот же адрес, но ответом, а не редиректом.
   *
   * Нужен скачиванию на устройство. `fetch` к порталу идёт с cookie
   * (`credentials: "include"`), а браузер переносит это требование и на цель
   * редиректа — S3 же на запрос с учётными данными отвечает без
   * `Access-Control-Allow-Credentials`, и байты до страницы не доходят.
   * Поэтому ссылку берут отдельно, а качают по ней анонимно — ровно так же,
   * как браузер льёт файл подписанным PUT мимо API.
   */
  @Get(':id/stream-url')
  async streamUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<MusicTrackStreamUrlDto> {
    return {
      url: await this.resolveUrl(user, id),
      expiresInSeconds: MUSIC_STREAM_URL_TTL_SECONDS,
    };
  }

  /**
   * Ссылка на скачивание файлом — кнопка «Скачать» в карточке записи
   * (VED-107). Отдаётся каждому вошедшему, кому запись видна: те же байты
   * он и так получает при прослушивании, а файл под понятным именем нужен,
   * чтобы взять бхаджан с собой вне портала.
   *
   * Ответом, а не редиректом, по той же причине, что и `stream-url`: страница
   * берёт ссылку запросом с обновлением сессии и уводит браузер уже на бакет,
   * где `Content-Disposition: attachment` превращает переход в сохранение.
   */
  @Get(':id/download-url')
  async downloadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<MusicTrackStreamUrlDto> {
    return {
      url: await this.resolveUrl(user, id, true),
      expiresInSeconds: MUSIC_STREAM_URL_TTL_SECONDS,
    };
  }

  private async resolveUrl(
    user: AccessTokenPayload,
    id: string,
    asAttachment = false,
  ): Promise<string> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id },
      select: {
        storageKey: true,
        status: true,
        uploadedById: true,
        title: true,
        mime: true,
        artist: { select: { name: true } },
      },
    });

    const visible =
      track &&
      (track.status === 'published' ||
        isAdmin(user) ||
        track.uploadedById === user.sub);

    // 404 и на «нет записи», и на «не для вас»: иначе по коду ответа можно
    // перебрать, какие черновики существуют.
    if (!track || !visible) throw new NotFoundException('Запись не найдена');

    const url = await this.storage.presignGet(
      track.storageKey,
      asAttachment
        ? attachmentDisposition(
            musicDownloadFileName({
              title: track.title,
              artistName: track.artist?.name ?? null,
              mime: track.mime,
            }),
          )
        : undefined,
    );
    if (!url) {
      throw new ServiceUnavailableException('Хранилище недоступно');
    }

    return url;
  }
}
