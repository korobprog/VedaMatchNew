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

/** Ссылка на заливку живёт час: сотня мегабайт по плохой связи льётся долго. */
export const BOOK_UPLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * Ссылка на скачивание живёт шесть часов — столько держат открытой страницу
 * материала, и настолько же ограничен ущерб, если ссылку перешлют наружу.
 */
const BOOK_DOWNLOAD_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Файлы книг в S3. Копия приёма из Музыки и «Работы»: контракт сервисного
 * модуля запрещает импортировать чужой сервис, поэтому дублирование
 * осознанное.
 *
 * Объекты кладутся без публичного доступа и раздаются подписанной ссылкой:
 * книга не должна лежать по вечному адресу, который разойдётся по чатам.
 */
@Injectable()
export class LibraryBookStorageService {
  private readonly logger = new Logger(LibraryBookStorageService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.bucket = this.config.get<string>('S3_BUCKET_NAME');
    this.s3Client =
      region && accessKeyId && secretAccessKey
        ? new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  /**
   * В локальной разработке S3 обычно не настроен — это штатно: заливка
   * отвечает отказом, остальное Образование работает.
   */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket);
  }

  /**
   * Подписанный PUT. `ContentType` и `ContentLength` входят в подпись: иначе
   * выданной ссылкой можно залить что угодно и любого размера, а проверка
   * на завершении случится уже после того, как байты в бакете.
   */
  async presignPut(
    key: string,
    mime: string,
    sizeBytes: number,
  ): Promise<string | null> {
    if (!this.s3Client || !this.bucket) return null;

    // Приведение типа — тот же приём, что в Музыке: `client-s3` и
    // `s3-request-presigner` тянут разные копии @smithy/types, и структурно
    // одинаковые классы не сходятся по приватному полю.
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: sizeBytes,
      }),
      { expiresIn: BOOK_UPLOAD_URL_TTL_SECONDS },
    );
  }

  /** `null` — объекта нет: ссылку браузер получил, но так и не залил файл. */
  async head(key: string): Promise<{ sizeBytes: number } | null> {
    if (!this.s3Client || !this.bucket) return null;

    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: Number(result.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  /**
   * Подписанная ссылка на скачивание. Имя и тип подставляет само хранилище
   * по параметрам ссылки: у объекта в бакете имени нет, только ключ.
   */
  async signedGet(
    key: string,
    disposition: string,
    contentType: string,
  ): Promise<string> {
    if (!this.s3Client || !this.bucket) return '';

    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseContentType: contentType,
      }),
      { expiresIn: BOOK_DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  /**
   * Удаление. Молча: строка файла к этому моменту уже удалена, и оставшийся
   * в бакете объект — мусор, а не потеря. Ронять из-за него снятие файла
   * или материала нельзя.
   */
  async remove(key: string): Promise<void> {
    if (!this.s3Client || !this.bucket) return;

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить файл книги ${key}: ${String(error)}`,
      );
    }
  }
}
