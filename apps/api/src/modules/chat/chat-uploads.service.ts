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
import type { ChatUploadResult } from '@vedamatch/shared';
import { momentKeyPrefix } from './chat-storage-scope';
import { attachmentKindFor } from './chat-upload-rules';

/**
 * Файлы переписки в S3. Копия приёма из объявлений и Рынка: контракт
 * сервисного модуля запрещает импортировать чужой сервис, поэтому
 * дублирование здесь осознанное.
 *
 * Отличие от картинок объявлений — приватность. Карточка объявления живёт в
 * поисковой выдаче и кешируется CDN, переписка не должна: объекты кладутся
 * без публичного ACL и раздаются по прямой ссылке бакета, который закрыт
 * политикой. Голос и документы не пережимаются, картинки — да.
 */
/**
 * Сколько живёт подписанная ссылка на файл переписки. Шесть часов: столько
 * человек листает открытую вкладку, и настолько же ограничен ущерб, если
 * ссылку кто-то перешлёт наружу. Аватары подписываются на неделю, но они и не
 * приватны — их видно всякому, кто открыл профиль.
 */
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

const IMAGE_WIDTH = 1600;
const IMAGE_QUALITY = 80;

/**
 * Момент смотрят во весь экран телефона и ровно один раз, поэтому кадр уже
 * ленты вложений: лишние пиксели здесь платятся не местом в бакете, а
 * секундой ожидания на мобильной сети.
 */
const MOMENT_WIDTH = 1080;
const MOMENT_QUALITY = 82;

export interface UploadedChatFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

@Injectable()
export class ChatUploadsService {
  private readonly logger = new Logger(ChatUploadsService.name);
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
   * В локальной разработке S3 обычно не настроен — это штатное состояние:
   * загрузка отвечает отказом, текстовая переписка работает.
   */
  get configured(): boolean {
    return Boolean(this.s3Client && this.bucket && this.publicUrl);
  }

  /** Начало адресов нашего бакета: по нему ответы узнают свои файлы. */
  get storagePrefix(): string | null {
    return this.publicUrl ? `${this.publicUrl.replace(/\/$/, '')}/` : null;
  }

  /**
   * Подписанный адрес взамен прямого. Бакет закрыт политикой, и прямая ссылка
   * на объект отвечает 403: фотография не показывалась, голосовое молчало.
   */
  async signPublicUrl(url: string): Promise<string> {
    const prefix = this.storagePrefix;
    if (!prefix || !this.s3Client || !this.bucket || !url.startsWith(prefix))
      return url;
    // Уже подписанный адрес подписывать нельзя: подпись стала бы частью имени
    // объекта, и ссылка повела бы в никуда.
    if (url.includes('X-Amz-Signature=')) return url;
    const key = decodeURIComponent(url.slice(prefix.length));
    if (!key) return url;
    return getSignedUrl(
      this.s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ATTACHMENT_SIGNED_URL_TTL_SECONDS },
    );
  }

  /**
   * Убрать объекты из бакета. Ошибка одного файла не должна ронять операцию,
   * ради которой чистка затевалась: беседа уже удалена, и оставшийся в бакете
   * файл — это мусор, а не потеря.
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

  async store(
    conversationId: string,
    file: UploadedChatFile,
  ): Promise<ChatUploadResult | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;
    const kind = attachmentKindFor(file.mimetype);
    if (!kind) return null;

    if (kind === 'image') return this.storeImage(conversationId, file);

    const extension = this.extensionFor(file);
    const key = `chat/${conversationId}/${randomUUID()}${extension}`;
    await this.put(key, file.buffer, file.mimetype);

    return {
      kind,
      key,
      url: this.urlFor(key),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  /**
   * Фотография момента. Своя папка, а не папка беседы: момент не принадлежит
   * ни одной беседе и переживает их все, а ответы на него живут сразу в
   * нескольких. Пути собраны в `chat-storage-scope.ts` — на них держится
   * проверка вложений.
   */
  async storeMomentImage(
    userId: string,
    file: UploadedChatFile,
  ): Promise<ChatUploadResult | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;
    if (attachmentKindFor(file.mimetype) !== 'image') return null;

    const key = `${momentKeyPrefix(userId)}${randomUUID()}.webp`;
    const { data, info } = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    })
      .rotate()
      .resize({ width: MOMENT_WIDTH, withoutEnlargement: true })
      .webp({ quality: MOMENT_QUALITY })
      .toBuffer({ resolveWithObject: true });

    await this.put(key, data, 'image/webp');

    return {
      kind: 'image',
      key,
      url: this.urlFor(key),
      mimeType: 'image/webp',
      sizeBytes: info.size,
      width: info.width,
      height: info.height,
    };
  }

  private async storeImage(
    conversationId: string,
    file: UploadedChatFile,
  ): Promise<ChatUploadResult | null> {
    const key = `chat/${conversationId}/${randomUUID()}.webp`;
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
      kind: 'image',
      key,
      url: this.urlFor(key),
      mimeType: 'image/webp',
      sizeBytes: info.size,
      width: info.width,
      height: info.height,
    };
  }

  private async put(key: string, body: Buffer, contentType: string) {
    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: this.bucket!,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Переписка не кешируется посредниками: приватная ссылка, отданная
        // прокси-кешу, переживёт удаление сообщения.
        CacheControl: 'private, max-age=0, no-store',
      }),
    );
  }

  private urlFor(key: string): string {
    return `${this.publicUrl!.replace(/\/$/, '')}/${key}`;
  }

  private extensionFor(file: UploadedChatFile): string {
    const fromName = file.originalname?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0];
    if (fromName) return fromName.toLowerCase();
    if (file.mimetype === 'application/pdf') return '.pdf';
    if (file.mimetype.startsWith('audio/')) return '.webm';
    return '';
  }

  warnUnavailable(conversationId: string) {
    this.logger.warn(
      `S3 не настроен — вложение в беседу ${conversationId} не сохранено`,
    );
  }
}
