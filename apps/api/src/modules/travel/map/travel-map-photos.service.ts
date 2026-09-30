import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export const MAX_MAP_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAP_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const PHOTO_WIDTH = 1600;
const PHOTO_QUALITY = 80;

export interface UploadedMapPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Фото мест народной карты. В отличие от фото гостей хостела они публичны:
 * место видно всем, картинка лежит с `public-read` и открывается по прямой
 * ссылке (как картинки объявлений). Своя копия работы с S3 — контракт
 * сервисного модуля запрещает брать чужой сервис.
 */
@Injectable()
export class TravelMapPhotosService {
  private readonly logger = new Logger(TravelMapPhotosService.name);
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

  /** Локально S3 обычно не настроен — это штатно, а не ошибка. */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket && this.publicUrl);
  }

  /** Ключ случайный: перезалив не упирается в кэш старой картинки. */
  async upload(
    placeId: string,
    file: UploadedMapPhoto | undefined,
  ): Promise<{ key: string; url: string }> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) {
      throw new ServiceUnavailableException(
        'Загрузка фото сейчас недоступна: хранилище не настроено',
      );
    }
    if (!file?.buffer) {
      throw new BadRequestException('Файл не передан');
    }
    if (!MAP_PHOTO_MIME.has(file.mimetype)) {
      throw new BadRequestException('Подойдут только JPEG, PNG и WebP');
    }
    if (file.size > MAX_MAP_PHOTO_BYTES) {
      throw new BadRequestException('Фото больше 10 МБ');
    }
    let data: Buffer;
    try {
      data = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: true,
      })
        .rotate()
        .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
        .webp({ quality: PHOTO_QUALITY })
        .toBuffer();
    } catch {
      throw new BadRequestException('Не удалось прочитать изображение');
    }
    const key = `travel/map/${placeId}/${randomUUID()}.webp`;
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
    return { key, url: `${this.publicUrl.replace(/\/$/, '')}/${key}` };
  }

  /** Ошибки удаления только логируем: строка в базе уже обновлена. */
  async remove(key: string | null): Promise<void> {
    if (!key || !this.s3Client || !this.bucket) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось удалить фото места ${key}: ${String(error)}`,
      );
    }
  }
}
