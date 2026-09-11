import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  LIBRARY_BOOK_FILES_PER_ENTRY,
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type CompleteLibraryBookUploadRequest,
  type CreateLibraryBookUploadRequest,
  type LibraryBookFormat,
  type LibraryBookUploadResponse,
  type LibraryEntryFileDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOOK_MIME,
  bookDisposition,
  bookFileKey,
  bookFileName,
  bookFormatOfKey,
  bookUploadRejection,
} from './book-files';
import {
  BOOK_UPLOAD_URL_TTL_SECONDS,
  LibraryBookStorageService,
} from './library-book-storage.service';

interface FileRow {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

/**
 * Файлы книг у материала Образования: pdf, epub, djvu, doc и прочие.
 *
 * Файл идёт мимо API: сервер выдаёт подписанный PUT, браузер льёт прямо в
 * бакет и возвращается за завершением. Сто мегабайт через Nest в буфере не
 * пройдут. Строка в базе появляется только на завершении, после сверки
 * объекта, — поэтому незавершённых заливок в базе не бывает и чистить их не
 * нужно.
 *
 * Прикрепляют и снимают автор материала и админ — те же, кто может его
 * править. Жалоба снимает файл вместе с материалом: скрытый материал
 * страницы не отдаёт, а с ней и ссылок на его файлы.
 */
@Injectable()
export class LibraryFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LibraryBookStorageService,
  ) {}

  async createUpload(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
    body: CreateLibraryBookUploadRequest,
  ): Promise<LibraryBookUploadResponse> {
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('book_upload_unavailable');
    }
    const entry = await this.editableEntry(userId, viewerIsAdmin, entryId);
    const rejection = bookUploadRejection({
      fileName: body?.fileName,
      sizeBytes: body?.sizeBytes,
      filesCount: entry.filesCount,
    });
    if (rejection) throw new BadRequestException(rejection);

    const format = libraryBookFormatOf(body.fileName) as LibraryBookFormat;
    const key = bookFileKey(entryId, format, randomUUID());
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
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
    body: CompleteLibraryBookUploadRequest,
  ): Promise<LibraryEntryFileDto> {
    const entry = await this.editableEntry(userId, viewerIsAdmin, entryId);
    const format = bookFormatOfKey(body?.key, entryId);
    if (!format) throw new BadRequestException('book_key_mismatch');

    // Повторное завершение — не ошибка: браузер мог не дождаться ответа и
    // спросить ещё раз, а файл уже прикреплён.
    const already = await this.prisma.libraryEntryFile.findUnique({
      where: { storageKey: body.key },
    });
    if (already) return this.toDto(already);

    if (entry.filesCount >= LIBRARY_BOOK_FILES_PER_ENTRY) {
      await this.storage.remove(body.key);
      throw new BadRequestException('too_many_book_files');
    }
    const object = await this.storage.head(body.key);
    if (!object) throw new BadRequestException('book_file_missing');
    // Размер держит и подпись ссылки, но сверка здесь не зависит от того,
    // соблюдает ли хранилище подписанный Content-Length.
    if (object.sizeBytes > LIBRARY_BOOK_MAX_BYTES) {
      await this.storage.remove(body.key);
      throw new BadRequestException('book_file_too_large');
    }

    const created = await this.prisma.libraryEntryFile.create({
      data: {
        entryId,
        storageKey: body.key,
        name: bookFileName(body.fileName, format),
        format,
        sizeBytes: object.sizeBytes,
        addedById: userId,
      },
    });
    return this.toDto(created);
  }

  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
    fileId: string,
  ): Promise<void> {
    await this.editableEntry(userId, viewerIsAdmin, entryId);
    const file = await this.prisma.libraryEntryFile.findUnique({
      where: { id: fileId },
      select: { id: true, entryId: true, storageKey: true },
    });
    if (!file || file.entryId !== entryId) {
      throw new NotFoundException('book_file_not_found');
    }
    await this.prisma.libraryEntryFile.delete({ where: { id: file.id } });
    // Объект — после строки: упадёт удаление из бакета, останется мусор, а
    // не ссылка в никуда на странице материала.
    await this.storage.remove(file.storageKey);
  }

  /** Файлы материала для его страницы — с подписанными ссылками. */
  async forEntry(entryId: string): Promise<LibraryEntryFileDto[]> {
    const files = await this.prisma.libraryEntryFile.findMany({
      where: { entryId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(files.map((file) => this.toDto(file)));
  }

  /**
   * Ключи объектов материала. Забирать до его удаления: строки файлов уйдут
   * каскадом, и найти потом объекты в бакете будет не по чему.
   */
  async keysOf(entryId: string): Promise<string[]> {
    const files = await this.prisma.libraryEntryFile.findMany({
      where: { entryId },
      select: { storageKey: true },
    });
    return files.map((file) => file.storageKey);
  }

  async removeObjects(keys: readonly string[]): Promise<void> {
    for (const key of keys) await this.storage.remove(key);
  }

  /**
   * Материал, к которому этот человек вправе прикреплять файлы. Скрытый
   * жалобами или снятый — 404, как и на его странице.
   */
  private async editableEntry(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
  ): Promise<{ filesCount: number }> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id: entryId },
      select: {
        status: true,
        addedById: true,
        _count: { select: { files: true } },
      },
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    if (entry.addedById !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }
    return { filesCount: entry._count.files };
  }

  private async toDto(file: FileRow): Promise<LibraryEntryFileDto> {
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
