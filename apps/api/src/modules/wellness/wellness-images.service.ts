import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

/**
 * Обложки статей раздела «Знания». Копия notices/notice-images.service.ts:
 * контракт сервисного модуля запрещает импортировать сервисы чужого модуля,
 * поэтому дублирование здесь осознанное, а не недосмотр.
 *
 * Обложка показывается в карточке статьи всем читателям, поэтому объекты
 * публичные, а не подписанные ссылки.
 */
const IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 78;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredImage {
  key: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

@Injectable()
export class WellnessImagesService {
  private readonly logger = new Logger(WellnessImagesService.name);
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
          })
        : null;
  }

  /**
   * В локальной разработке S3 обычно не настроен — это штатное состояние,
   * а не ошибка: загрузка отдаёт `image_upload_unavailable`, всё остальное
   * работает.
   */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket && this.publicUrl);
  }

  /** `null` — файл прошёл проверку. */
  validate(
    file: UploadedImageFile | undefined,
  ): 'unsupported_type' | 'file_too_large' | null {
    if (!file) return 'unsupported_type';
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) return 'unsupported_type';
    if (file.size > MAX_UPLOAD_BYTES) return 'file_too_large';
    return null;
  }

  /** Ключ случайный: новая обложка не перезаписывает закешированную старую. */
  storeArticleCover(
    articleId: string,
    file: UploadedImageFile,
  ): Promise<StoredImage | null> {
    return this.store(
      `wellness/articles/${articleId}/${randomUUID()}.webp`,
      file.buffer,
    );
  }

  /**
   * Убирает объект из S3. Ошибки только логируем: строка в базе уже удалена,
   * и осиротевший файл в бакете не повод валить запрос пользователю.
   */
  async remove(key: string | null | undefined): Promise<void> {
    if (!key || !this.s3Client || !this.bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Не удалось удалить картинку ${key}: ${String(error)}`);
    }
  }

  private async store(
    key: string,
    source: Buffer,
  ): Promise<StoredImage | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;

    const pipeline = sharp(source, { failOn: 'error', limitInputPixels: true })
      // rotate() без аргументов применяет EXIF-ориентацию: фото с телефона
      // иначе приезжает лежащим на боку.
      .rotate()
      .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

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
      sizeBytes: info.size,
    };
  }
}
