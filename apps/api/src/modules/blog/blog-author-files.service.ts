import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BLOG_AUTHOR_FILES_MAX,
  blogAuthorFileFormatOf,
  type BlogAuthorFileDto,
  type BlogAuthorFileFormat,
  type BlogAuthorFileUploadResponse,
  type BlogAuthorFilesResponse,
  type CompleteBlogAuthorFileUploadRequest,
  type CreateBlogAuthorFileUploadRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  AUTHOR_FILE_MIME,
  authorFileDisposition,
  authorFileFormatOfKey,
  authorFileKey,
  authorFileKind,
  authorFileMaxBytes,
  authorFileName,
  authorFileUploadRejection,
} from './blog-author-files';
import {
  BLOG_FILE_UPLOAD_URL_TTL_SECONDS,
  BlogFileStorageService,
} from './blog-file-storage.service';

interface FileRow {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

/**
 * Файлы на личной странице автора (VED-686, часть 2): аудио, видео и
 * документы. Приём как в Библиотеке: сервер выдаёт подписанный PUT, браузер
 * льёт прямо в бакет и возвращается за завершением; строка в базе
 * появляется только после сверки объекта. Заливает и снимает сам автор,
 * смотрит любой вошедший — кроме тех, кого зритель не должен видеть.
 */
@Injectable()
export class BlogAuthorFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly storage: BlogFileStorageService,
  ) {}

  async createUpload(
    userId: string,
    body: CreateBlogAuthorFileUploadRequest,
  ): Promise<BlogAuthorFileUploadResponse> {
    if (!this.storage.configured)
      throw new ServiceUnavailableException('file_upload_unavailable');
    const rejection = authorFileUploadRejection({
      fileName: body?.fileName,
      sizeBytes: body?.sizeBytes,
      filesCount: await this.prisma.blogAuthorFile.count({ where: { userId } }),
    });
    if (rejection) throw new BadRequestException(rejection);

    const format = blogAuthorFileFormatOf(
      body.fileName,
    ) as BlogAuthorFileFormat;
    const key = authorFileKey(userId, format, randomUUID());
    const mime = AUTHOR_FILE_MIME[format];
    const url = await this.storage.presignPut(key, mime, body.sizeBytes);
    if (!url) throw new ServiceUnavailableException('file_upload_unavailable');
    return {
      key,
      url,
      headers: { 'Content-Type': mime },
      expiresInSeconds: BLOG_FILE_UPLOAD_URL_TTL_SECONDS,
    };
  }

  /** Заливка закончена: сверяем объект в бакете и прикрепляем файл. */
  async complete(
    userId: string,
    body: CompleteBlogAuthorFileUploadRequest,
  ): Promise<BlogAuthorFileDto> {
    const format = authorFileFormatOfKey(body?.key, userId);
    if (!format) throw new BadRequestException('file_key_mismatch');

    // Повтор завершения (обрыв ответа, двойной клик) не плодит строк.
    const already = await this.prisma.blogAuthorFile.findUnique({
      where: { storageKey: body.key },
    });
    if (already) return this.toDto(already);

    const count = await this.prisma.blogAuthorFile.count({ where: { userId } });
    if (count >= BLOG_AUTHOR_FILES_MAX) {
      await this.storage.remove(body.key);
      throw new BadRequestException('too_many_files');
    }
    const object = await this.storage.head(body.key);
    if (!object) throw new BadRequestException('file_missing');
    if (object.sizeBytes <= 0) {
      await this.storage.remove(body.key);
      throw new BadRequestException('file_empty');
    }
    if (object.sizeBytes > authorFileMaxBytes(format)) {
      await this.storage.remove(body.key);
      throw new BadRequestException('file_too_large');
    }

    const created = await this.prisma.blogAuthorFile.create({
      data: {
        userId,
        storageKey: body.key,
        name: authorFileName(body.fileName, format),
        format,
        sizeBytes: object.sizeBytes,
      },
    });
    return this.toDto(created);
  }

  /** Снять можно только свой файл; чужой отвечает так же, как несуществующий. */
  async remove(userId: string, fileId: string): Promise<void> {
    const file = await this.prisma.blogAuthorFile.findUnique({
      where: { id: fileId },
      select: { id: true, userId: true, storageKey: true },
    });
    if (!file || file.userId !== userId)
      throw new NotFoundException('file_not_found');
    await this.prisma.blogAuthorFile.delete({ where: { id: file.id } });
    await this.storage.remove(file.storageKey);
  }

  /**
   * Файлы страницы автора со ссылками. Скрытый зрителю человек отвечает так
   * же, как несуществующий, — то же правило, что у ленты автора.
   */
  async forAuthor(
    viewerId: string,
    _viewerIsAdmin: boolean,
    authorId: string,
  ): Promise<BlogAuthorFilesResponse> {
    const hidden = await this.moderation.hiddenUserIds(viewerId, 'all');
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author || (hidden.has(authorId) && authorId !== viewerId)) {
      throw new NotFoundException('author_not_found');
    }
    const files = await this.prisma.blogAuthorFile.findMany({
      where: { userId: authorId },
      orderBy: { createdAt: 'desc' },
    });
    return { files: await Promise.all(files.map((file) => this.toDto(file))) };
  }

  private async toDto(file: FileRow): Promise<BlogAuthorFileDto> {
    const format = file.format as BlogAuthorFileFormat;
    return {
      id: file.id,
      name: file.name,
      format,
      kind: authorFileKind(format),
      sizeBytes: file.sizeBytes,
      url: await this.storage.signedGet(
        file.storageKey,
        authorFileDisposition(file.name, format),
        AUTHOR_FILE_MIME[format],
      ),
      createdAt: file.createdAt.toISOString(),
    };
  }
}
