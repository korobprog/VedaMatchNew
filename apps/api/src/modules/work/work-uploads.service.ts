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
import { workUploadKindFor } from './work-upload-rules';

/**
 * Файлы задач в S3. Копия приёма из переписки: контракт сервисного модуля
 * запрещает импортировать чужой сервис, поэтому дублирование осознанное.
 *
 * Файлы приватны. Скриншот в задаче виден только участникам среды: объекты
 * кладутся без публичного ACL и раздаются подписанной ссылкой — как вложения
 * переписки, а не как картинки Рынка, которые живут в поисковой выдаче.
 */

/**
 * Сколько живёт подписанная ссылка. Шесть часов: столько человек держит
 * открытой карточку задачи, и настолько же ограничен ущерб, если ссылку
 * кто-то перешлёт наружу.
 */
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

const IMAGE_WIDTH = 1600;
const IMAGE_QUALITY = 80;

export interface UploadedWorkFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export interface StoredWorkFile {
  storageKey: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

@Injectable()
export class WorkUploadsService {
  private readonly logger = new Logger(WorkUploadsService.name);
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
   * В локальной разработке S3 обычно не настроен — это штатное состояние:
   * загрузка отвечает отказом, доска и задачи работают.
   */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket);
  }

  /**
   * Хранится ключ, а не адрес: подписанная ссылка живёт шесть часов, и
   * записать её в базу значило бы раздавать протухшие адреса. Адрес собирается
   * на каждый показ карточки.
   */
  async store(
    taskId: string,
    file: UploadedWorkFile,
  ): Promise<StoredWorkFile | null> {
    if (!this.s3Client || !this.bucket) return null;
    const kind = workUploadKindFor(file.mimetype);
    if (!kind) return null;

    if (kind === 'image') return this.storeImage(taskId, file);

    const key = `work/${taskId}/${randomUUID()}${this.extensionFor(file)}`;
    await this.put(key, file.buffer, file.mimetype);
    return {
      storageKey: key,
      mime: file.mimetype,
      sizeBytes: file.size,
      width: null,
      height: null,
    };
  }

  private async storeImage(
    taskId: string,
    file: UploadedWorkFile,
  ): Promise<StoredWorkFile> {
    const key = `work/${taskId}/${randomUUID()}.webp`;
    const { data, info } = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    })
      // rotate() без аргументов применяет EXIF-ориентацию: фото с телефона
      // иначе приезжает лежащим на боку.
      .rotate()
      .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer({ resolveWithObject: true });

    await this.put(key, data, 'image/webp');
    return {
      storageKey: key,
      mime: 'image/webp',
      sizeBytes: info.size,
      width: info.width,
      height: info.height,
    };
  }

  /** Подписанный адрес объекта. Прямая ссылка на закрытый бакет отдаёт 403. */
  async signedUrl(storageKey: string): Promise<string> {
    if (!this.s3Client || !this.bucket) return '';
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: ATTACHMENT_SIGNED_URL_TTL_SECONDS },
    );
  }

  /**
   * Убрать объекты из бакета. Ошибка одного файла не роняет операцию, ради
   * которой чистка затевалась: строка вложения уже удалена, и оставшийся в
   * бакете файл — это мусор, а не потеря.
   */
  async removeMany(keys: readonly string[]): Promise<void> {
    if (!this.s3Client || !this.bucket || keys.length === 0) return;
    for (const key of keys) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } catch (error) {
        this.logger.warn(
          `Не удалось убрать файл ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async put(key: string, body: Buffer, contentType: string) {
    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: this.bucket!,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Задача не кешируется посредниками: приватная ссылка, отданная
        // прокси-кешу, переживёт удаление вложения.
        CacheControl: 'private, max-age=0, no-store',
      }),
    );
  }

  private extensionFor(file: UploadedWorkFile): string {
    const fromName = file.originalname?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0];
    if (fromName) return fromName.toLowerCase();
    if (file.mimetype === 'application/pdf') return '.pdf';
    return '';
  }

  warnUnavailable(taskId: string) {
    this.logger.warn(
      `S3 не настроен — вложение в задачу ${taskId} не сохранено`,
    );
  }
}
