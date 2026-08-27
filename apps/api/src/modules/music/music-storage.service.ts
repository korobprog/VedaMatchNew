import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MUSIC_STREAM_URL_TTL_SECONDS } from '@vedamatch/shared';

/**
 * Объекты Музыки в S3.
 *
 * Копия обвязки из market-images.service.ts: контракт сервисного модуля
 * запрещает импортировать сервисы другого модуля. Отличия от Рынка два, и
 * оба осознанные.
 *
 * Первое: аудио **приватное**. Публичный объект означает, что каталог
 * выкачивается одним `wget` по CDN-адресам, и никакая проверка прав на
 * маршруте этого не остановит. Наружу уходит подписанная ссылка на шесть
 * часов. Обложки, наоборот, публичные — их кеширует CDN и они нужны в
 * SSR-разметке.
 *
 * Второе: файл **не проходит через API**. Киртан на сорок минут это
 * 60–120 МБ; гонять такое через Nest в буфере, как Рынок гоняет картинки до
 * 10 МБ, нельзя — процесс держит их в памяти целиком. Браузер получает
 * подписанный PUT и льёт напрямую в бакет.
 */

/**
 * Сколько байт от начала объекта читать ради тегов.
 *
 * Целиком качать незачем: заголовок mp3 и Xing/LAME-кадр лежат в начале, а
 * длительность для CBR считается из общего размера, который и так известен
 * из HEAD. Мегабайт с запасом покрывает обложку, вшитую в теги.
 */
const METADATA_PREFIX_BYTES = 1024 * 1024;

/** Подписанный PUT живёт час: заливка 120 МБ на слабом канале в это уложится. */
const UPLOAD_URL_TTL_SECONDS = 60 * 60;

export interface StoredObjectFacts {
  sizeBytes: number;
  /**
   * ETag объекта. Для загрузки одним PUT это MD5 содержимого, и он достаётся
   * бесплатно из HEAD — в отличие от честной SHA-256, ради которой пришлось
   * бы выкачать все сто мегабайт обратно в API.
   */
  etag: string | null;
}

@Injectable()
export class MusicStorageService {
  private readonly logger = new Logger(MusicStorageService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly publicUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.bucket = this.config.get<string>('S3_BUCKET_NAME');
    this.publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    this.s3Client =
      region && accessKeyId && secretAccessKey
        ? new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
            // Без этого SDK кладёт в подписанный PUT `x-amz-checksum-crc32`,
            // посчитанный по пустому телу: подписываем-то мы команду без
            // байтов. Браузер заливает настоящий файл, сумма не сходится, и
            // S3 отвечает отказом. Проверено на выданной ссылке — в запросе
            // стояло `x-amz-checksum-crc32=AAAAAA==`, то есть CRC32 нуля байт.
            requestChecksumCalculation: 'WHEN_REQUIRED',
          })
        : null;
  }

  /**
   * В локальной разработке S3 обычно не настроен — это штатное состояние, а
   * не ошибка: каталог работает, недоступна только загрузка.
   */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket);
  }

  /** Ключ объекта. Человек в путь не попадает — только его id и случайность. */
  buildKey(userId: string, extension: string): string {
    const safe = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp3';
    return `music/uploads/${userId}/${crypto.randomUUID()}.${safe}`;
  }

  /**
   * Подписанный PUT. `ContentType` и `ContentLength` входят в подпись:
   * иначе выданной ссылкой можно залить что угодно и любого размера, а
   * проверка на `complete` случится уже после того, как байты в бакете.
   */
  async presignPut(
    key: string,
    mime: string,
    sizeBytes: number,
  ): Promise<string | null> {
    if (!this.s3Client || !this.bucket) return null;

    // Приведение типа — тот же приём, что в chat-uploads и activity-avatar:
    // `client-s3` и `s3-request-presigner` тянут разные копии @smithy/types,
    // и структурно одинаковые классы не сходятся по приватному полю.
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: sizeBytes,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }

  /** Подписанная ссылка на прослушивание. */
  async presignGet(key: string): Promise<string | null> {
    if (!this.s3Client || !this.bucket) return null;

    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: MUSIC_STREAM_URL_TTL_SECONDS },
    );
  }

  /** `null` — объекта нет: браузер ссылку получил, но так и не залил файл. */
  async head(key: string): Promise<StoredObjectFacts | null> {
    if (!this.s3Client || !this.bucket) return null;

    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: Number(result.ContentLength ?? 0),
        etag: result.ETag ? result.ETag.replace(/"/g, '') : null,
      };
    } catch {
      return null;
    }
  }

  /** Начало объекта — ради тегов. `null`, если прочитать не удалось. */
  async readPrefix(key: string): Promise<Buffer | null> {
    if (!this.s3Client || !this.bucket) return null;

    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${METADATA_PREFIX_BYTES - 1}`,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      this.logger.warn(
        `Не удалось прочитать начало объекта ${key}: ${String(error)}`,
      );
      return null;
    }
  }

  /**
   * Удаление. Молча: чистка незавершённых загрузок не должна падать из-за
   * объекта, которого и так нет.
   */
  async remove(key: string): Promise<void> {
    if (!this.s3Client || !this.bucket) return;

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Не удалось удалить объект ${key}: ${String(error)}`);
    }
  }

  /** Публичный адрес обложки — единственное, что раздаётся напрямую. */
  coverUrl(key: string | null): string | null {
    if (!key || !this.publicUrl) return null;
    return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
