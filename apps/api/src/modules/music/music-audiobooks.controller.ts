import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMusicAudiobookRequest,
  SetMusicAudiobookChaptersRequest,
  UpdateMusicAudiobookRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { AdminUnlimited } from '../auth/admin-unlimited.guard';
import { MusicAudiobooksService } from './music-audiobooks.service';
import { isAdmin } from './is-admin';
import { parseAudiobookKind } from './music-audiobook-kind';

/**
 * Раздел «Аудиокниги» (VED-237 → VED-297). Открыт гостю, как и витрина:
 * ссылка на книгу из мессенджера обязана открываться. Место, где человек
 * остановился, приходит только вошедшему — позиции плеера есть только у
 * него.
 */
@Controller('music/audiobooks')
@UseGuards(OptionalAuthGuard)
export class MusicAudiobooksController {
  constructor(private readonly audiobooks: MusicAudiobooksService) {}

  /** `kind=lecture` — раздел «Лекции» (VED-437), без него — «Аудиокниги». */
  @Get()
  list(@Query('kind') kind?: string) {
    return this.audiobooks.list(parseAudiobookKind(kind));
  }

  @Get(':slug')
  page(@Param('slug') slug: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.audiobooks.page(
      slug,
      user?.sub ?? null,
      user ? isAdmin(user) : false,
    );
  }
}

/**
 * Редактор книг в админке Музыки. Лимит и его снятие для администратора —
 * те же, что у справочников (`music-admin-catalog.controller.ts`): каждая
 * перестановка главы — запрос, и 120 в час кончались бы на сборке одной
 * многоглавой книги.
 */
@Controller('music/admin/audiobooks')
@UseGuards(AuthGuard)
@AdminUnlimited('music')
@Throttle({ default: { ttl: 3_600_000, limit: 120 } })
export class MusicAdminAudiobooksController {
  constructor(private readonly audiobooks: MusicAudiobooksService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.audiobooks.adminList(isAdmin(user));
  }

  /** Подбор глав: `q` — поиск, `reader` — записи чтеца книги. */
  @Get('candidates')
  candidates(
    @CurrentUser() user: AccessTokenPayload,
    @Query('q') q?: string,
    @Query('reader') reader?: string,
  ) {
    return this.audiobooks.candidates(
      isAdmin(user),
      typeof q === 'string' ? q : null,
      typeof reader === 'string' && reader ? reader : null,
    );
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicAudiobookRequest,
  ) {
    return this.audiobooks.create(isAdmin(user), body ?? ({} as never));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicAudiobookRequest,
  ) {
    return this.audiobooks.update(isAdmin(user), id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.audiobooks.remove(isAdmin(user), id);
  }

  @Put(':id/chapters')
  setChapters(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetMusicAudiobookChaptersRequest,
  ) {
    return this.audiobooks.setChapters(isAdmin(user), id, body);
  }
}
