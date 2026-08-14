import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePreviewUrl } from './preview-url';

/** Обложку в ленте показываем шириной до 640px — больше не нужно. */
const PREVIEW_WIDTH = 640;
const PREVIEW_QUALITY = 72;
const DOWNLOAD_TIMEOUT_MS = 5000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

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
      await this.prisma.libraryEntry.update({
        where: { id: entryId },
        data: {
          previewKey: stored.key,
          previewUrl: stored.url,
          enrichmentStatus: 'ready',
          enrichedAt: new Date(),
        },
      });
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

    const key = `library/previews/${entryId}.webp`;
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
