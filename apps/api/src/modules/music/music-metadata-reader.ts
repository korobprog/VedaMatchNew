import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import type { RawAudioMetadata } from './music-metadata-parse';

/**
 * Единственное место, где сервис касается пакета `music-metadata`.
 *
 * Отдельным классом по двум причинам. Пакет поставляется только как ESM, а
 * модуль собирается в CommonJS — статическим `import` его сюда не втащить,
 * и динамический `import()` под `nodenext` уходит мимо реестра Jest, то есть
 * подменить его в тесте нельзя. Инжектируемый класс подменяется обычным
 * способом, а разбор того, что пакет вернул, живёт в `music-metadata-parse`
 * и тестируется без него.
 */
@Injectable()
export class MusicMetadataReader {
  private readonly logger = new Logger(MusicMetadataReader.name);

  /**
   * `totalBytes` передаётся отдельно, потому что читаем только начало
   * объекта: длительность для CBR пакет считает из общего размера файла, а
   * не из того куска, который ему дали.
   */
  async read(
    prefix: Buffer,
    mime: string,
    totalBytes: number,
  ): Promise<RawAudioMetadata | null> {
    try {
      const { parseBuffer } = await import('music-metadata');
      return await parseBuffer(prefix, {
        mimeType: mime,
        size: totalBytes,
      });
    } catch (error) {
      // Нечитаемые теги — не сбой сервиса: загрузку отклонит валидатор,
      // потому что без длительности запись в каталоге бесполезна.
      this.logger.warn(`Теги не прочитались: ${String(error)}`);
      return null;
    }
  }

  /**
   * Длительность по файлу целиком (VED-310): поток читается до конца, и
   * `duration: true` велит пакету пересчитать кадры, а не верить заголовку
   * или первому кадру. Обложки пропускаем — они здесь не нужны, а в памяти
   * заняли бы сотню килобайт на запись. `null` — не прочиталось.
   */
  async readDuration(
    stream: Readable,
    mime: string,
    totalBytes: number,
  ): Promise<number | null> {
    try {
      const { parseStream } = await import('music-metadata');
      const result = await parseStream(
        stream,
        { mimeType: mime, size: totalBytes },
        { duration: true, skipCovers: true },
      );
      return result.format.duration ?? null;
    } catch (error) {
      this.logger.warn(`Длительность не прочиталась: ${String(error)}`);
      return null;
    }
  }
}
