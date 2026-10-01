import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type AdminAuditEvent,
  type CompleteVedabaseBookUploadRequest,
  type CreateVedabaseBookUploadRequest,
  type LibraryBookFormat,
  type VedabaseBookFileDto,
  type VedabaseBookUploadResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOOK_MIME,
  BOOK_SNIFF_BYTES,
  VEDABASE_BOOK_FILES_PER_BOOK,
  bookContentMatches,
  bookDisposition,
  bookFileAuditDetails,
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

interface BookRef {
  id: string;
  title: string;
  filesCount: number;
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
    private readonly events: EventEmitter2,
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

  /**
   * Заливка закончена: сверяем объект в бакете и прикрепляем файл.
   *
   * Повтор с тем же ключом отдаёт уже прикреплённый файл — браузер
   * переспрашивает завершение, когда ответ потерялся по дороге.
   */
  async complete(
    actorId: string,
    slug: string,
    body: CompleteVedabaseBookUploadRequest,
  ): Promise<VedabaseBookFileDto> {
    const book = await this.book(slug);
    const format = bookFormatOfKey(body?.key, book.id);
    if (!format) throw new BadRequestException('book_key_mismatch');

    const already = await this.attached(body.key);
    if (already) return this.toDto(already);

    const object = await this.storage.head(body.key);
    if (!object) throw new BadRequestException('book_file_missing');
    if (object.sizeBytes <= 0)
      throw await this.reject(body.key, 'book_file_empty');
    if (object.sizeBytes > LIBRARY_BOOK_MAX_BYTES)
      throw await this.reject(body.key, 'book_file_too_large');
    const head = await this.storage.readHead(body.key, BOOK_SNIFF_BYTES);
    if (!bookContentMatches(format, head))
      throw await this.reject(body.key, 'book_file_content_mismatch');

    const data = {
      bookId: book.id,
      storageKey: body.key,
      name: bookFileName(body.fileName, format),
      format,
      sizeBytes: object.sizeBytes,
      addedById: actorId,
    };
    let created: FileRow | null;
    try {
      created = await this.attach(book.id, data);
    } catch (error) {
      // Параллельный повтор того же завершения успел первым.
      const winner = isUniqueViolation(error)
        ? await this.attached(body.key)
        : null;
      if (!winner) throw error;
      return this.toDto(winner);
    }
    if (!created) throw await this.reject(body.key, 'too_many_book_files');

    this.audit(actorId, 'vedabase.file-added', slug, book.title, created);
    return this.toDto(created);
  }

  async remove(actorId: string, slug: string, fileId: string): Promise<void> {
    const book = await this.book(slug);
    const file = await this.prisma.vedabaseBookFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.bookId !== book.id)
      throw new NotFoundException('book_file_not_found');
    await this.prisma.vedabaseBookFile.delete({ where: { id: file.id } });
    await this.storage.remove(file.storageKey);
    this.audit(actorId, 'vedabase.file-removed', slug, book.title, file);
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

  /**
   * Строка файла под замком книги: счёт и вставка в одной транзакции.
   * Без замка два завершения разом оба видели девять файлов и оба
   * прикрепляли десятый. `null` — у книги уже предел.
   */
  private attach(
    bookId: string,
    data: Prisma.VedabaseBookFileUncheckedCreateInput,
  ): Promise<FileRow | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VedabaseBook" WHERE "id" = ${bookId} FOR UPDATE`;
      const count = await tx.vedabaseBookFile.count({ where: { bookId } });
      if (count >= VEDABASE_BOOK_FILES_PER_BOOK) return null;
      return tx.vedabaseBookFile.create({ data });
    });
  }

  private attached(key: string): Promise<FileRow | null> {
    return this.prisma.vedabaseBookFile.findUnique({
      where: { storageKey: key },
    });
  }

  /** Объект не подошёл: убираем его из бакета и отвечаем причиной. */
  private async reject(
    key: string,
    reason: string,
  ): Promise<BadRequestException> {
    await this.storage.remove(key);
    return new BadRequestException(reason);
  }

  private audit(
    actorId: string,
    action: 'vedabase.file-added' | 'vedabase.file-removed',
    slug: string,
    book: string,
    file: Pick<FileRow, 'name' | 'format' | 'sizeBytes'>,
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      targetType: 'platform',
      targetId: slug,
      details: bookFileAuditDetails({
        book,
        name: file.name,
        format: file.format,
        sizeBytes: file.sizeBytes,
      }),
    };
    this.events.emit('admin.action', event);
  }

  private async book(slug: string): Promise<BookRef> {
    const book = await this.prisma.vedabaseBook.findUnique({
      where: { slug },
      select: { id: true, title: true, _count: { select: { files: true } } },
    });
    if (!book) throw new NotFoundException('book_not_found');
    return { id: book.id, title: book.title, filesCount: book._count.files };
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
