import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type CompleteVedabaseBookUploadRequest,
  type CreateVedabaseBookUploadRequest,
  type LibraryBookFormat,
  type VedabaseBookFileDto,
  type VedabaseBookUploadResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOOK_MIME,
  VEDABASE_BOOK_FILES_PER_BOOK,
  bookDisposition,
  bookFileKey,
  bookFileName,
  bookFormatOfKey,
  bookUploadRejection,
} from './book-files';
import {
  BOOK_UPLOAD_URL_TTL_SECONDS,
  VedabaseBookStorageService,
} from './book-storage.service';

interface FileRow {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

/**
 * Файлы книг Библиотеки для скачивания (VED-662, часть 3б): epub, fb2, pdf
 * и прочие. Приём как в Образовании: сервер выдаёт подписанный PUT, браузер
 * льёт прямо в бакет и возвращается за завершением; строка в базе
 * появляется только после сверки объекта. Заливает и снимает админ
 * сервиса, скачивает любой вошедший — пока книга не заблокирована.
 */
@Injectable()
export class VedabaseFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: VedabaseBookStorageService,
  ) {}

  async createUpload(
    slug: string,
    body: CreateVedabaseBookUploadRequest,
  ): Promise<VedabaseBookUploadResponse> {
    if (!this.storage.configured)
      throw new ServiceUnavailableException('book_upload_unavailable');
    const book = await this.book(slug);
    const rejection = bookUploadRejection({
      fileName: body?.fileName,
      sizeBytes: body?.sizeBytes,
      filesCount: book.filesCount,
    });
    if (rejection) throw new BadRequestException(rejection);

    const format = libraryBookFormatOf(body.fileName) as LibraryBookFormat;
    const key = bookFileKey(book.id, format, randomUUID());
    const mime = BOOK_MIME[format];
    const url = await this.storage.presignPut(key, mime, body.sizeBytes);
    if (!url) throw new ServiceUnavailableException('book_upload_unavailable');
    return {
      key,
      url,
      headers: { 'Content-Type': mime },
      expiresInSeconds: BOOK_UPLOAD_URL_TTL_SECONDS,
    };
  }

  /** Заливка закончена: сверяем объект в бакете и прикрепляем файл. */
  async complete(
    actorId: string,
    slug: string,
    body: CompleteVedabaseBookUploadRequest,
  ): Promise<VedabaseBookFileDto> {
    const book = await this.book(slug);
    const format = bookFormatOfKey(body?.key, book.id);
    if (!format) throw new BadRequestException('book_key_mismatch');

    const already = await this.prisma.vedabaseBookFile.findUnique({
      where: { storageKey: body.key },
    });
    if (already) return this.toDto(already);

    if (book.filesCount >= VEDABASE_BOOK_FILES_PER_BOOK) {
      await this.storage.remove(body.key);
      throw new BadRequestException('too_many_book_files');
    }
    const object = await this.storage.head(body.key);
    if (!object) throw new BadRequestException('book_file_missing');
    if (object.sizeBytes > LIBRARY_BOOK_MAX_BYTES) {
      await this.storage.remove(body.key);
      throw new BadRequestException('book_file_too_large');
    }

    const created = await this.prisma.vedabaseBookFile.create({
      data: {
        bookId: book.id,
        storageKey: body.key,
        name: bookFileName(body.fileName, format),
        format,
        sizeBytes: object.sizeBytes,
        addedById: actorId,
      },
    });
    return this.toDto(created);
  }

  async remove(slug: string, fileId: string): Promise<void> {
    const book = await this.book(slug);
    const file = await this.prisma.vedabaseBookFile.findUnique({
      where: { id: fileId },
      select: { id: true, bookId: true, storageKey: true },
    });
    if (!file || file.bookId !== book.id)
      throw new NotFoundException('book_file_not_found');
    await this.prisma.vedabaseBookFile.delete({ where: { id: file.id } });
    await this.storage.remove(file.storageKey);
  }

  /**
   * Файлы книги со ссылками на скачивание. Читателю заблокированная книга
   * не отдаёт ничего — как и её главы; админу — всё.
   */
  async forBook(
    slug: string,
    options: { includeBlocked: boolean },
  ): Promise<VedabaseBookFileDto[]> {
    const book = await this.prisma.vedabaseBook.findUnique({
      where: { slug },
      select: { id: true, blocked: true },
    });
    if (!book || (book.blocked && !options.includeBlocked))
      throw new NotFoundException('book_not_found');
    const files = await this.prisma.vedabaseBookFile.findMany({
      where: { bookId: book.id },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(files.map((file) => this.toDto(file)));
  }

  private async book(
    slug: string,
  ): Promise<{ id: string; filesCount: number }> {
    const book = await this.prisma.vedabaseBook.findUnique({
      where: { slug },
      select: { id: true, _count: { select: { files: true } } },
    });
    if (!book) throw new NotFoundException('book_not_found');
    return { id: book.id, filesCount: book._count.files };
  }

  private async toDto(file: FileRow): Promise<VedabaseBookFileDto> {
    const format = file.format as LibraryBookFormat;
    return {
      id: file.id,
      name: file.name,
      format,
      sizeBytes: file.sizeBytes,
      url: await this.storage.signedGet(
        file.storageKey,
        bookDisposition(file.name, format),
        BOOK_MIME[format],
      ),
      createdAt: file.createdAt.toISOString(),
    };
  }
}
