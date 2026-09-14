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

export const MAX_GUEST_PHOTO_BYTES = 10 * 1024 * 1024;
export const GUEST_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Фото гостя смотрят на ресепшене с телефона — больше 800 точек не нужно. */
const PHOTO_WIDTH = 800;
const PHOTO_QUALITY = 78;
/** Ссылка живёт час: карточку открывают и закрывают, а не держат вкладкой. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface UploadedGuestPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Фото гостей хостела. В отличие от витрины Рынка это персональные данные:
 * объект приватный, наружу уходит подписанная ссылка на час. Своя копия
 * работы с S3 — контракт сервисного модуля запрещает брать чужой сервис.
 */
@Injectable()
export class TravelGuestPhotosService {
  private readonly logger = new Logger(TravelGuestPhotosService.name);
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

  /** Локально S3 обычно не настроен — это штатно, а не ошибка. */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket);
  }

  /** Ключ случайный: перезалив не затирает кэш старой подписанной ссылки. */
  async store(stayId: string, file: UploadedGuestPhoto): Promise<string> {
    if (!this.s3Client || !this.bucket) {
      throw new Error('storage_unavailable');
    }
    const data = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    })
      .rotate()
      .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
      .webp({ quality: PHOTO_QUALITY })
      .toBuffer();
    const key = `travel/stays/${stayId}/guests/${randomUUID()}.webp`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'image/webp',
        CacheControl: 'private, max-age=3600',
      }),
    );
    return key;
  }

  async signedUrl(key: string | null): Promise<string | null> {
    if (!key || !this.s3Client || !this.bucket) return null;
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
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
        `Не удалось удалить фото гостя ${key}: ${String(error)}`,
      );
    }
  }
}
