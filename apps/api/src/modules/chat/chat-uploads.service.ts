import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ChatUploadResult } from '@vedamatch/shared';
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
