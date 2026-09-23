import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MotivationSavedImageService } from './motivation-saved-image.service';
import {
  parseSavedImageQuality,
  SAVED_IMAGE_QUALITIES,
} from './saved-image-quality';

/**
 * Файл для «Сохранить картинку» и «Отправить в приложение» (VED-227, VED-247,
 * VED-156).
 *
 * Публичный, как и сама `/m/<slug>`: картинкой делятся с теми, у кого
 * аккаунта нет. Ходит сюда веб-маршрут `/m/<slug>/story`, который кладёт
 * файл на наш домен, — иначе браузер проигнорирует `download` и не отдаст
 * файл в `navigator.share` из-за CORS.
 *
 * Готовый файл — переадресация в хранилище: собранное однажды API не
 * перекачивает через себя. Лимит выше общего: экран «Поделиться» запрашивает
 * файл при каждом открытии.
 *
 * `?q=light|standard|max` — качество файла (VED-156, «3 кнопки сохранить
 * изображение в разном качестве»). Без параметра — лёгкий, как раньше.
 */
@Controller('motivation/posts')
@Throttle({ default: { ttl: 60_000, limit: 300 } })
export class MotivationSavedImageController {
  constructor(private readonly savedImages: MotivationSavedImageService) {}

  @Get(':slug/saved-image')
  async savedImage(
    @Param('slug') slug: string,
    @Query('q') rawQuality: unknown,
    @Res() response: Response,
  ) {
    const quality = parseSavedImageQuality(rawQuality);
    if (!quality)
      throw new BadRequestException(
        `Качество: ${SAVED_IMAGE_QUALITIES.join(', ')}`,
      );
    const result = await this.savedImages.forSlug(slug, quality);
    if (result.kind === 'stored') {
      // Ключ меняется вместе с содержимым, поэтому ответ можно кэшировать:
      // тот же адрес всегда ведёт на ту же картинку, пока пост не поправили.
      response.set('Cache-Control', 'public, max-age=300');
      response.redirect(302, result.url);
      return;
    }
    response.set({
      'Content-Type': result.contentType,
      'Content-Length': String(result.bytes.length),
      'Cache-Control': 'no-store',
    });
    response.end(result.bytes);
  }
}
