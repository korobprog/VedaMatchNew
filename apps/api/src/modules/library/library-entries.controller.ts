import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CompleteLibraryBookUploadRequest,
  CreateLibraryBookUploadRequest,
  CreateLibraryCommentRequest,
  CreateLibraryEntryRequest,
  UpdateLibraryEntryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminUnlimited } from '../auth/admin-unlimited.guard';
import { LibraryBookmarksService } from './library-bookmarks.service';
import { LibraryCommentsService } from './library-comments.service';
import {
  LibraryEntriesService,
  type LibraryFeedFilters,
  type UploadedPreviewFile,
} from './library-entries.service';
import { LibraryFilesService } from './library-files.service';
import { isAdmin } from './is-admin';

@Controller('library/entries')
@UseGuards(AuthGuard)
export class LibraryEntriesController {
  constructor(
    private readonly entries: LibraryEntriesService,
    private readonly bookmarks: LibraryBookmarksService,
    private readonly comments: LibraryCommentsService,
    private readonly files: LibraryFilesService,
  ) {}

  @Get()
  feed(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: LibraryFeedFilters,
  ) {
    return this.entries.feed(query, user.sub, isAdmin(user));
  }

  /**
   * Организации, от имени которых в каталоге есть материалы. Объявлен до
   * `:id`: Nest сопоставляет маршруты в порядке объявления, и ниже параметра
   * этот путь читался бы как идентификатор записи.
   */
  @Get('communities')
  communities() {
    return this.entries.communityFacets();
  }

  /**
   * Страница материала — вместе с файлами книги. Файлы спрашиваются только
   * после того, как запись нашлась и опубликована: у скрытой жалобами
   * записи `byId` отвечает 404, и ссылок на её файлы никто не получит.
   */
  @Get(':id')
  async byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    const entry = await this.entries.byId(id, user.sub, isAdmin(user));
    return { ...entry, files: await this.files.forEntry(entry.id) };
  }

  /**
   * Добавление материала ограничено против спама. Админу лимит не считается —
   * он наполняет каталог пачками, как в чате при разборе жалоб.
   */
  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @AdminUnlimited('library')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryEntryRequest,
  ) {
    return this.entries.create(user.sub, body);
  }

  @Patch(':id')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibraryEntryRequest,
  ) {
    return this.entries.update(user.sub, isAdmin(user), id, body);
  }

  /**
   * Ключи файлов забираем до удаления записи: строки файлов уходят вместе с
   * ней каскадом, и найти потом их объекты в бакете было бы не по чему.
   * Объекты убираем после — не удалась запись, файлы остаются на месте.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    const keys = await this.files.keysOf(id);
    await this.entries.remove(user.sub, isAdmin(user), id);
    await this.files.removeObjects(keys);
  }

  @Post(':id/preview')
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @AdminUnlimited('library')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadPreview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedPreviewFile,
  ) {
    return this.entries.uploadPreview(user.sub, isAdmin(user), id, file);
  }

  /**
   * Заявка на заливку файла книги: в ответ — подписанный PUT в бакет. Сам
   * файл через API не идёт, см. LibraryFilesService.
   */
  @Post(':id/files/upload')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  @AdminUnlimited('library')
  createFileUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateLibraryBookUploadRequest,
  ) {
    return this.files.createUpload(user.sub, isAdmin(user), id, body);
  }

  /** Заливка закончена — прикрепить файл к материалу. */
  @Post(':id/files')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  @AdminUnlimited('library')
  completeFileUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CompleteLibraryBookUploadRequest,
  ) {
    return this.files.complete(user.sub, isAdmin(user), id, body);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(204)
  removeFile(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.files.remove(user.sub, isAdmin(user), id, fileId);
  }

  @Post(':id/bookmark')
  @HttpCode(204)
  addBookmark(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.bookmarks.add(user.sub, id);
  }

  @Delete(':id/bookmark')
  @HttpCode(204)
  removeBookmark(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.bookmarks.remove(user.sub, id);
  }

  @Get(':id/comments')
  listComments(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.comments.list(id, user.sub, isAdmin(user));
  }

  @Post(':id/comments')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  addComment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateLibraryCommentRequest,
  ) {
    return this.comments.create(id, user.sub, body);
  }
}

@Controller('library/comments')
@UseGuards(AuthGuard)
export class LibraryCommentsController {
  constructor(private readonly comments: LibraryCommentsService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.comments.remove(id, user.sub, isAdmin(user));
  }
}
