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
 * Картинки новостей (VED-137). Копия notice-images.service.ts: контракт
 * сервисного модуля запрещает импортировать сервисы чужого модуля, поэтому
 * дублирование здесь осознанное.
 *
 * Шире, чем у объявлений: к новостям прикладывают скриншоты, и мелкий текст
 * на них должен читаться. Объекты публичные — новость попадает в серверный
 * HTML главной.
 */
const IMAGE_WIDTH = 1600;
const IMAGE_QUALITY = 82;

export const MAX_ANNOUNCEMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface UploadedAnnouncementImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export interface StoredAnnouncementImage {
  key: string;
  url: string;
  width: number;
  height: number;
}

@Injectable()
export class AnnouncementImagesService {
  private readonly logger = new Logger(AnnouncementImagesService.name);
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

  /** Локально S3 обычно не настроен — загрузка тогда просто недоступна. */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket && this.publicUrl);
  }

  /** Текст ошибки для человека; `null` — файл подходит. */
  validate(file: UploadedAnnouncementImage): string | null {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype))
      return 'Подходят JPG, PNG и WebP';
    if (file.size > MAX_ANNOUNCEMENT_UPLOAD_BYTES) return 'Файл больше 10 МБ';
    return null;
  }

  /** Публичный адрес по ключу: адрес из формы не принимаем на веру. */
  urlFor(key: string): string {
    return `${(this.publicUrl ?? '').replace(/\/$/, '')}/${key}`;
  }

  async store(
    file: UploadedAnnouncementImage,
  ): Promise<StoredAnnouncementImage | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;
    const key = `announcements/${randomUUID()}.webp`;

    const { data, info } = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    })
      // EXIF-ориентация: фото с телефона иначе приезжает лежащим на боку.
      .rotate()
      .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY })
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
      url: this.urlFor(key),
      width: info.width,
      height: info.height,
    };
  }

  /**
   * Убирает объекты из S3. Ошибки только логируем: строка в базе уже
   * изменена, и осиротевший файл не повод валить сохранение новости.
   */
  async removeMany(keys: string[]): Promise<void> {
    const client = this.s3Client;
    const bucket = this.bucket;
    if (!client || !bucket) return;
    await Promise.all(
      keys.map(async (key) => {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          );
        } catch (error) {
          this.logger.warn(
            `Не удалось удалить картинку новости ${key}: ${String(error)}`,
          );
        }
      }),
    );
  }
}
