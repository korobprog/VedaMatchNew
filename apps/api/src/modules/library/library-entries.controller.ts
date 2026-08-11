import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryCommentRequest,
  CreateLibraryEntryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryBookmarksService } from './library-bookmarks.service';
import { LibraryCommentsService } from './library-comments.service';
import {
  LibraryEntriesService,
  type LibraryFeedFilters,
} from './library-entries.service';

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
    return this.entries.feed(query, user.sub);
  }

  @Get(':id')
  byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.entries.byId(id, user.sub);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryEntryRequest,
  ) {
    return this.entries.create(user.sub, body);
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

function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}
