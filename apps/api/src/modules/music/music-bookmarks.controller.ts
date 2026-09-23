import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  CreateMusicBookmarkRequest,
  UpdateMusicBookmarkRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicBookmarksService } from './music-bookmarks.service';

/**
 * Метки-закладки в записях (VED-388). Только свои: список — по записи,
 * потому что плеер показывает метки той записи, что играет.
 */
@Controller('music/bookmarks')
@UseGuards(AuthGuard)
export class MusicBookmarksController {
  constructor(private readonly bookmarks: MusicBookmarksService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('trackId') trackId: string,
  ) {
    return this.bookmarks.list(user.sub, trackId);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicBookmarkRequest,
  ) {
    return this.bookmarks.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicBookmarkRequest,
  ) {
    return this.bookmarks.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.bookmarks.remove(user.sub, id);
  }
}
