import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ChatAttachmentInput, ChatUploadResult } from '@vedamatch/shared';
import { attachmentKindFor } from './chat-upload-rules';
import { toPublicStorageUrl } from '../../common/storage-public-url';

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
    ).then((url) =>
      toPublicStorageUrl(
        url,
        this.config.get<string>('S3_ENDPOINT'),
        this.config.get<string>('S3_PUBLIC_URL'),
      ),
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
   * Копия публичной картинки портала в папку беседы — для постов
   * официального канала (картинка новости из админки).
   *
   * Копия, а не ссылка на чужой объект: вложение переписки обязано лежать в
   * `chat/<беседа>/` (`assertStorageUrl`), иначе пост нельзя переслать, а
   * чистка беседы унесла бы файл новости. Копирует само хранилище, без
   * скачивания. Адрес не из нашего бакета — `null`: чужой сервер узнавал бы
   * IP каждого, кто открыл канал.
   */
  async copyImageIntoConversation(
    conversationId: string,
    image: { url: string; width: number; height: number },
  ): Promise<ChatAttachmentInput | null> {
    const prefix = this.storagePrefix;
    if (!this.s3Client || !this.bucket || !this.publicUrl || !prefix)
      return null;
    const sourceKey = storageKeyOf(image.url, prefix);
    if (!sourceKey) return null;
    const extension = sourceKey.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '.webp';
    const key = `chat/${conversationId}/${randomUUID()}${extension.toLowerCase()}`;
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: key,
        CopySource: `${this.bucket}/${encodeURI(sourceKey)}`,
        // Та же политика, что у загрузок переписки: без публичного ACL и
        // без кеша посредников.
        MetadataDirective: 'REPLACE',
        ContentType: imageMimeOf(extension),
        CacheControl: 'private, max-age=0, no-store',
      }),
    );
    return {
      kind: 'image',
      key,
      url: this.urlFor(key),
      mimeType: imageMimeOf(extension),
      ...(image.width > 0 ? { width: image.width } : {}),
      ...(image.height > 0 ? { height: image.height } : {}),
    };
  }

  /**
   * Фото статуса (VED-129): то же пережатие, что у картинок переписки, в
   * папке автора. Закрыто, как вся переписка, — ссылки подписывает
   * `ChatSignedUrlsInterceptor`.
   */
  async storeStatusImage(
    authorId: string,
    buffer: Buffer,
  ): Promise<{ key: string; url: string; width: number; height: number } | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;
    const key = `chat-status/${authorId}/${randomUUID()}.webp`;
    const { data, info } = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: true,
    })
      .rotate()
      .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer({ resolveWithObject: true });
    await this.put(key, data, 'image/webp');
    return { key, url: this.urlFor(key), width: info.width, height: info.height };
  }

  /** Ролик статуса как есть и его обложка (VED-129). */
  async storeStatusVideo(
    authorId: string,
    video: { buffer: Buffer; mimetype: string },
    extension: string,
    poster: Buffer,
  ): Promise<{
    key: string;
    url: string;
    posterKey: string;
    posterUrl: string;
  } | null> {
    if (!this.s3Client || !this.bucket || !this.publicUrl) return null;
    const base = `chat-status/${authorId}/${randomUUID()}`;
    const key = `${base}${extension}`;
    const posterKey = `${base}.webp`;
    await this.put(key, video.buffer, video.mimetype);
    await this.put(posterKey, poster, 'image/webp');
    return {
      key,
      url: this.urlFor(key),
      posterKey,
      posterUrl: this.urlFor(posterKey),
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

/**
 * Ключ объекта нашего бакета по публичному адресу; `null` — адрес чужой или
 * пустой. Ключ папки переписки не принимается: копировать чужую переписку
 * в канал этим путём нельзя, даже если адрес каким-то образом туда ведёт.
 */
export function storageKeyOf(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  let key: string;
  try {
    key = decodeURIComponent(url.slice(prefix.length).split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  if (!key || key.includes('..') || key.startsWith('chat/')) return null;
  return key;
}

function imageMimeOf(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'image/webp';
  }
}
