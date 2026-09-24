import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePreviewUrl } from './preview-url';
import { toPublicStorageUrl } from '../../common/storage-public-url';

/** Обложку в ленте показываем шириной до 640px — больше не нужно. */
const PREVIEW_WIDTH = 640;
const PREVIEW_QUALITY = 72;
const DOWNLOAD_TIMEOUT_MS = 5000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
/**
 * Ссылка «Скачать картинку» живёт десять минут: её берут по нажатию кнопки
 * и тут же открывают, дольше держать её незачем (VED-138).
 */
const COVER_DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

export interface StoredPreview {
  key: string;
  url: string;
}

/**
 * Обложки материалов: скачиваем у источника, жмём в webp и кладём в свой S3.
 *
 * Чужой CDN как постоянный источник ненадёжен — картинка может пропасть или
 * смениться, а ещё она выдаёт наших читателей YouTube. Поэтому храним копию,
 * а на исходный адрес откатываемся, только если S3 не настроен.
 */
@Injectable()
export class LibraryPreviewsService {
  private readonly logger = new Logger(LibraryPreviewsService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly publicUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
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
          })
        : null;
  }

  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket && this.publicUrl);
  }

  /**
   * Складывает обложку записи в S3 и переписывает ссылку на свою копию.
   * Ошибки только логируются: запись уже создана и живёт с адресом источника.
   */
  async capture(
    entryId: string,
    sourceUrl: string,
    knownRemote?: string,
  ): Promise<void> {
    if (!this.configured) return;

    const remote = knownRemote ?? (await resolvePreviewUrl(sourceUrl));
    if (!remote) return;

    try {
      const stored = await this.store(entryId, remote);
      if (!stored) return;
      const before = await this.prisma.libraryEntry.findUnique({
        where: { id: entryId },
        select: { previewKey: true, previewIsCustom: true },
      });
      /* Своя картинка автору дороже найденной на чужой странице. Правка это
         уже учитывала, а обогащение при создании — нет. Формы теперь шлют
         картинку сразу за созданием записи (VED-344, VED-355), то есть
         ровно тогда, когда фоновое обогащение ещё идёт: без этой проверки
         оно затирало бы приложенную картинку через пару секунд после
         публикации. Скачанное складываем в бакет и тут же убираем: раньше
         про ручную загрузку узнать нельзя — она идёт параллельно. */
      if (before?.previewIsCustom) {
        await this.remove(stored.key);
        return;
      }
      await this.prisma.libraryEntry.update({
        where: { id: entryId },
        data: {
          previewKey: stored.key,
          previewUrl: stored.url,
          enrichmentStatus: 'ready',
          enrichedAt: new Date(),
        },
      });
      // Ключ теперь новый на каждую загрузку — прежнюю копию не оставляем.
      if (before?.previewKey && before.previewKey !== stored.key)
        await this.remove(before.previewKey);
    } catch (error) {
      this.logger.warn(
        `Не удалось сохранить обложку записи ${entryId}: ${String(error)}`,
      );
    }
  }

  /** Фоновый вызов: создание ссылки не должно ждать загрузку картинки. */
  captureInBackground(
    entryId: string,
    sourceUrl: string,
    knownRemote?: string,
  ): void {
    void this.capture(entryId, sourceUrl, knownRemote);
  }

  /** `null` — картинку не скачали или не смогли обработать. */
  async store(
    entryId: string,
    remoteUrl: string,
  ): Promise<StoredPreview | null> {
    // Проверяем настройку S3 до скачивания: без бакета качать нечего сохранять.
    if (!this.configured) return null;

    const source = await this.download(remoteUrl);
    if (!source) return null;
    return this.storeBuffer(entryId, source);
  }

  /**
   * Сжимает уже имеющиеся байты картинки и кладёт их в S3. Общий хвост для
   * авто-обложки с сайта-источника (`store`) и ручной загрузки от автора.
   * `null` — S3 не настроен или файл не распознан как изображение.
   */
  async storeBuffer(
    entryId: string,
    source: Buffer,
  ): Promise<StoredPreview | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;

    const webp = await sharp(source, {
      failOn: 'error',
      limitInputPixels: true,
    })
      .rotate()
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();

    /* Новый ключ на каждую загрузку (VED-155). Объект отдаётся как
       неизменный на год, и при одном ключе на запись новая обложка ложилась
       по старому адресу: браузер и CDN показывали прежнюю, и казалось, что
       сменить её нельзя. Прежний файл удаляет тот, кто записывает новый
       ключ в запись. */
    const key = `library/previews/${entryId}-${randomUUID().slice(0, 8)}.webp`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: webp,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        ACL: 'public-read',
      }),
    );

    return { key, url: `${this.publicUrl.replace(/\/$/, '')}/${key}` };
  }

  /**
   * Картинка шлоки (VED-386): тот же путь, что у обложки, — сжатие в webp и
   * публичный неизменный объект, — но крупнее: её рассматривают во весь
   * экран, а не в карточке ленты. Ключ даёт вызывающий. `null` — S3 не
   * настроен.
   */
  async storeImage(
    key: string,
    source: Buffer,
    width: number,
  ): Promise<(StoredPreview & { width: number; height: number }) | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;

    const { data, info } = await sharp(source, {
      failOn: 'error',
      limitInputPixels: true,
    })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        ACL: 'public-read',
      }),
    );

    return {
      key,
      url: `${this.publicUrl.replace(/\/$/, '')}/${key}`,
      width: info.width,
      height: info.height,
    };
  }

  /**
   * Подписанная ссылка на скачивание копии обложки (VED-138). Сам объект
   * публичный, но по прямому адресу браузер показывает картинку, а не
   * сохраняет: имя и «файлом» подставляет хранилище по параметрам подписи.
   * `null` — S3 не настроен.
   */
  async signedDownload(
    key: string,
    disposition: string,
  ): Promise<string | null> {
    if (!this.s3Client || !this.bucket) return null;

    // Приведение типа — как в LibraryBookStorageService: `client-s3` и
    // `s3-request-presigner` тянут разные копии @smithy/types.
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: COVER_DOWNLOAD_URL_TTL_SECONDS },
    ).then((url) =>
      toPublicStorageUrl(
        url,
        this.config.get<string>('S3_ENDPOINT'),
        this.config.get<string>('S3_PUBLIC_URL'),
      ),
    );
  }

  /**
   * Убирает копию обложки из S3 после удаления записи. Ошибки только логируем:
   * запись уже удалена, и осиротевший файл в бакете не повод падать запросу.
   */
  async remove(key: string | null | undefined): Promise<void> {
    if (!key || !this.s3Client || !this.bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Не удалось удалить обложку ${key}: ${String(error)}`);
    }
  }

  private async download(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) return null;

      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_DOWNLOAD_BYTES) return null;

      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length > MAX_DOWNLOAD_BYTES ? null : bytes;
    } catch {
      return null;
    }
  }
}
