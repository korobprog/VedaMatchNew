import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toPublicStorageUrl } from '../../common/storage-public-url';

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
   * Подписанный PUT. `ContentLength` входит в подпись — выданной ссылкой
   * нельзя залить больше заявленного. `ContentType` в подпись не входит:
   * `s3-request-presigner` исключает его сам, поэтому тип объекта в бакете
   * ничего не гарантирует. Формат сверяется по содержимому на завершении
   * заливки, а при скачивании тип подставляет подписанная ссылка.
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
    ).then((url) =>
      toPublicStorageUrl(
        url,
        this.config.get<string>('S3_ENDPOINT'),
        this.config.get<string>('S3_PUBLIC_URL'),
      ),
    );
  }

  /**
   * `null` — объекта нет: ссылку браузер получил, но так и не залил файл.
   *
   * Любой другой сбой — отказ хранилища, а не «файла нет». Раньше он тоже
   * превращался в `null`: при недоступном S3 автору говорили, что файл не
   * загрузился, он лил сто мегабайт заново, а в логе не оставалось ничего.
   */
  async head(key: string): Promise<{ sizeBytes: number } | null> {
    if (!this.s3Client || !this.bucket) throw this.unavailable();

    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: Number(result.ContentLength ?? 0) };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw this.unavailable(`head ${key}`, error);
    }
  }

  /** Первые байты объекта — по ним сверяется формат книги. */
  async readHead(key: string, bytes: number): Promise<Uint8Array> {
    if (!this.s3Client || !this.bucket) throw this.unavailable();

    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${bytes - 1}`,
        }),
      );
      const body = await result.Body?.transformToByteArray();
      return body ? body.subarray(0, bytes) : new Uint8Array();
    } catch (error) {
      throw this.unavailable(`read ${key}`, error);
    }
  }

  /** Все объекты под префиксом — для уборки брошенных заливок. */
  async list(
    prefix: string,
  ): Promise<Array<{ key: string; lastModified: Date | null }>> {
    if (!this.s3Client || !this.bucket) return [];

    const objects: Array<{ key: string; lastModified: Date | null }> = [];
    let token: string | undefined;
    do {
      const page = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key)
          objects.push({
            key: item.Key,
            lastModified: item.LastModified ?? null,
          });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  private unavailable(
    action?: string,
    error?: unknown,
  ): ServiceUnavailableException {
    if (action)
      this.logger.error(
        `Хранилище файлов книг не ответило (${action}): ${String(error)}`,
      );
    return new ServiceUnavailableException('book_storage_unavailable');
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
    if (!this.s3Client || !this.bucket) throw this.unavailable();

    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseContentType: contentType,
      }),
      { expiresIn: BOOK_DOWNLOAD_URL_TTL_SECONDS },
    ).then((url) =>
      toPublicStorageUrl(
        url,
        this.config.get<string>('S3_ENDPOINT'),
        this.config.get<string>('S3_PUBLIC_URL'),
      ),
    );
  }

  /**
   * Удаление. Молча: строка файла к этому моменту уже удалена, и оставшийся
   * в бакете объект — мусор, а не потеря. Ронять из-за него снятие файла
   * или материала нельзя; оставшееся подберёт уборка брошенных объектов.
   * `false` — объект остался.
   */
  async remove(key: string): Promise<boolean> {
    if (!this.s3Client || !this.bucket) return false;

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить файл книги ${key}: ${String(error)}`,
      );
      return false;
    }
  }
}

/** Ответ «такого объекта нет» — в отличие от любого другого отказа S3. */
export function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, $metadata } = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    $metadata?.httpStatusCode === 404
  );
}
