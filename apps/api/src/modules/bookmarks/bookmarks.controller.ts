import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateBookmarkRequest,
  UpdateBookmarkRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BookmarksService } from './bookmarks.service';

/**
 * Закладки человека. Префикс маршрутов равен слагу раздела, как требует
 * docs/service-module-contract.md; чужих таблиц раздел не читает вовсе —
 * ему хватает пути и подписи, которые прислал браузер.
 */
@Controller('bookmarks')
@UseGuards(AuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.bookmarks.list(user.sub);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 300 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateBookmarkRequest,
  ) {
    return this.bookmarks.create(user.sub, body);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateBookmarkRequest,
  ) {
    return this.bookmarks.rename(user.sub, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.bookmarks.remove(user.sub, id);
  }
}
