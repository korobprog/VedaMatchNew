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
import { isAdmin } from './is-admin';

@Controller('library/entries')
@UseGuards(AuthGuard)
export class LibraryEntriesController {
  constructor(
    private readonly entries: LibraryEntriesService,
    private readonly bookmarks: LibraryBookmarksService,
    private readonly comments: LibraryCommentsService,
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

  @Get(':id')
  byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.entries.byId(id, user.sub, isAdmin(user));
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

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.entries.remove(user.sub, isAdmin(user), id);
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
