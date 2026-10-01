import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  LIBRARY_BOOK_FILES_PER_ENTRY,
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type AdminAuditEvent,
  type CompleteLibraryBookUploadRequest,
  type CreateLibraryBookUploadRequest,
  type LibraryBookFormat,
  type LibraryBookUploadResponse,
  type LibraryEntryFileDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOOK_MIME,
  BOOK_SNIFF_BYTES,
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
  LibraryBookStorageService,
} from './library-book-storage.service';

interface EntryRef {
  filesCount: number;
  title: string;
  addedById: string | null;
}

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
  private readonly logger = new Logger(LibraryFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LibraryBookStorageService,
    private readonly events: EventEmitter2,
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

  /**
   * Заливка закончена: сверяем объект в бакете и прикрепляем файл.
   *
   * Повтор с тем же ключом отдаёт уже прикреплённый файл — браузер
   * переспрашивает завершение, когда ответ потерялся по дороге.
   */
  async complete(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
    body: CompleteLibraryBookUploadRequest,
  ): Promise<LibraryEntryFileDto> {
    const entry = await this.editableEntry(userId, viewerIsAdmin, entryId);
    const format = bookFormatOfKey(body?.key, entryId);
    if (!format) throw new BadRequestException('book_key_mismatch');

    const already = await this.attached(body.key);
    if (already) return this.toDto(already);

    const object = await this.storage.head(body.key);
    if (!object) throw new BadRequestException('book_file_missing');
    if (object.sizeBytes <= 0)
      throw await this.reject(body.key, 'book_file_empty');
    // Размер держит и подпись ссылки, но сверка здесь не зависит от того,
    // соблюдает ли хранилище подписанный Content-Length.
    if (object.sizeBytes > LIBRARY_BOOK_MAX_BYTES)
      throw await this.reject(body.key, 'book_file_too_large');
    const head = await this.storage.readHead(body.key, BOOK_SNIFF_BYTES);
    if (!bookContentMatches(format, head))
      throw await this.reject(body.key, 'book_file_content_mismatch');

    const data = {
      entryId,
      storageKey: body.key,
      name: bookFileName(body.fileName, format),
      format,
      sizeBytes: object.sizeBytes,
      addedById: userId,
    };
    let created: FileRow | null;
    try {
      created = await this.attach(entryId, data);
    } catch (error) {
      // Параллельный повтор того же завершения успел первым.
      const winner = isUniqueViolation(error)
        ? await this.attached(body.key)
        : null;
      if (!winner) throw error;
      return this.toDto(winner);
    }
    if (!created) throw await this.reject(body.key, 'too_many_book_files');

    this.audit(
      userId,
      viewerIsAdmin,
      entry,
      entryId,
      'library.file-added',
      created,
    );
    return this.toDto(created);
  }

  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
    fileId: string,
  ): Promise<void> {
    const entry = await this.editableEntry(userId, viewerIsAdmin, entryId);
    const file = await this.prisma.libraryEntryFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.entryId !== entryId) {
      throw new NotFoundException('book_file_not_found');
    }
    await this.prisma.libraryEntryFile.delete({ where: { id: file.id } });
    // Объект — после строки: упадёт удаление из бакета, останется мусор, а
    // не ссылка в никуда на странице материала.
    await this.storage.remove(file.storageKey);
    this.audit(
      userId,
      viewerIsAdmin,
      entry,
      entryId,
      'library.file-removed',
      file,
    );
  }

  /** Файлы материала для его страницы — с подписанными ссылками. */
  async forEntry(entryId: string): Promise<LibraryEntryFileDto[]> {
    // Страницу материала читают все, и статья или видео не должны падать
    // оттого, что хранилище не настроено: ссылок на скачивание всё равно не
    // выдать, поэтому отвечаем пустым списком. Остальные пути (`complete`)
    // без хранилища честно отвечают 503.
    if (!this.storage.configured) {
      this.logger.warn(
        `Хранилище файлов книг не настроено: файлы материала ${entryId} не отданы`,
      );
      return [];
    }
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
   * Строка файла под замком материала: счёт и вставка в одной транзакции.
   * Без замка два завершения разом оба видели четыре файла и оба
   * прикрепляли пятый. `null` — у материала уже предел.
   */
  private attach(
    entryId: string,
    data: Prisma.LibraryEntryFileUncheckedCreateInput,
  ): Promise<FileRow | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "LibraryEntry" WHERE "id" = ${entryId} FOR UPDATE`;
      const count = await tx.libraryEntryFile.count({ where: { entryId } });
      if (count >= LIBRARY_BOOK_FILES_PER_ENTRY) return null;
      return tx.libraryEntryFile.create({ data });
    });
  }

  private attached(key: string): Promise<FileRow | null> {
    return this.prisma.libraryEntryFile.findUnique({
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

  /**
   * В журнал попадает только админ над чужим материалом: автор, который
   * возится со своими файлами, — не админское действие.
   */
  private audit(
    userId: string,
    viewerIsAdmin: boolean,
    entry: EntryRef,
    entryId: string,
    action: 'library.file-added' | 'library.file-removed',
    file: Pick<FileRow, 'name' | 'format' | 'sizeBytes'>,
  ): void {
    if (!viewerIsAdmin || entry.addedById === userId) return;
    const event: AdminAuditEvent = {
      actorId: userId,
      action,
      targetType: 'platform',
      targetId: entryId,
      details: bookFileAuditDetails({
        entry: entry.title,
        name: file.name,
        format: file.format,
        sizeBytes: file.sizeBytes,
      }),
    };
    this.events.emit('admin.action', event);
  }

  /**
   * Материал, к которому этот человек вправе прикреплять файлы. Скрытый
   * жалобами или снятый — 404, как и на его странице.
   */
  private async editableEntry(
    userId: string,
    viewerIsAdmin: boolean,
    entryId: string,
  ): Promise<EntryRef> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id: entryId },
      select: {
        status: true,
        addedById: true,
        titleRu: true,
        titleEn: true,
        url: true,
        _count: { select: { files: true } },
      },
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    if (entry.addedById !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }
    return {
      filesCount: entry._count.files,
      title: entry.titleRu ?? entry.titleEn ?? entry.url ?? entryId,
      addedById: entry.addedById,
    };
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
