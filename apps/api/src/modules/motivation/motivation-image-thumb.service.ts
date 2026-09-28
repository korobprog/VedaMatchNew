import { Injectable, Logger } from '@nestjs/common';
import { MotivationGenerationService } from './motivation-generation.service';
import { renderImageThumb, thumbKeyForImageKey } from './image-thumb';

/**
 * Поля копии для записи в пост вместе с новой картинкой. Счётчик попыток
 * бэкфилла обнуляется: у новой картинки своя история, и прежние неудачи
 * (битый старый файл) не должны отнимать у неё попытки.
 */
export function thumbFields(imageThumbUrl: string | null) {
  return {
    imageThumbUrl,
    imageThumbAttempts: 0,
    imageThumbAttemptAt: null,
  };
}

/**
 * Лёгкая копия иллюстрации (VED-629): пережимает кадр в WebP 720 и кладёт
 * рядом с оригиналом.
 *
 * Вызывается там, где картинка появляется, — у генерации и у загрузок, пока
 * байты ещё в памяти. Сбой копии не роняет основную операцию: пост с
 * картинкой важнее её облегчённой версии, а недостающую копию доделает
 * бэкфилл (`MotivationThumbWorkerService`).
 */
@Injectable()
export class MotivationImageThumbService {
  private readonly logger = new Logger(MotivationImageThumbService.name);

  constructor(private readonly generation: MotivationGenerationService) {}

  /** Копия по готовому ключу; ошибки наружу — решает вызывающий. */
  async upload(thumbKey: string, bytes: Buffer): Promise<string> {
    const thumb = await renderImageThumb(bytes);
    return this.generation.uploadStory(thumbKey, thumb, 'image/webp');
  }

  /**
   * Копия рядом с только что залитым оригиналом. `null` — не получилось;
   * причина уходит в лог, а пост остаётся за бэкфиллом.
   */
  async forNewImage(imageKey: string, bytes: Buffer): Promise<string | null> {
    try {
      return await this.upload(thumbKeyForImageKey(imageKey), bytes);
    } catch (error) {
      this.logger.warn(
        `Unable to build image thumb for ${imageKey}: ${String(error)}`,
      );
      return null;
    }
  }
}
