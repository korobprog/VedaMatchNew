import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryBookmarksService } from './library-bookmarks.service';

/**
 * Закладки Образования текущего пользователя (VED-539) — для окна
 * «Закладки» в рубрике и на главной сервиса. Ставятся и снимаются они на
 * самой записи: `POST/DELETE library/entries/:id/bookmark`.
 */
@Controller('library/bookmarks')
@UseGuards(AuthGuard)
export class LibraryBookmarksController {
  constructor(private readonly bookmarks: LibraryBookmarksService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.bookmarks.list(user.sub);
  }
}
