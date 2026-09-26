import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppManifestService } from './app-manifest.service';
import { isManifestAppVariant, manifestTrack } from './app-release';

/**
 * Манифест самообновления приложения с сайта — публично, без входа: его
 * спрашивает и гость на экране «Сервисы», и сборка, у которой сессия
 * протухла. Путь повторяет раскладку хранилища
 * (`mobile/android/<вариант>/latest.json`), чтобы по адресу было видно, что
 * это тот же файл.
 *
 * Лимит строже общего (100/мин): приложение спрашивает раз на запуск и по
 * кнопке, а ответ всё равно из кэша на минуту.
 */
@Controller('notifications/app-release')
export class AppReleaseManifestController {
  constructor(private readonly manifests: AppManifestService) {}

  @Get(':variant/latest.json')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60')
  async latest(
    @Param('variant') variant: string,
    @Query('track') track?: string,
  ): Promise<Record<string, unknown>> {
    if (!isManifestAppVariant(variant))
      throw new NotFoundException('Такой сборки приложения нет');
    const outcome = await this.manifests.latest(variant, manifestTrack(track));
    if (outcome.kind === 'ok') return outcome.manifest;
    if (outcome.kind === 'not-found')
      throw new NotFoundException('Манифест этой сборки не опубликован');
    throw new ServiceUnavailableException(
      'Хранилище обновлений сейчас недоступно',
    );
  }
}
