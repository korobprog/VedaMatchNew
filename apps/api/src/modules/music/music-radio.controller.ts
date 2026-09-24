import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  MUSIC_RADIO_INSERT_MAX_BYTES,
  type AccessTokenPayload,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminUnlimited } from '../auth/admin-unlimited.guard';
import { isAdmin } from './is-admin';
import {
  MusicRadioService,
  type UploadedRadioFile,
} from './music-radio.service';

/**
 * Эфир «Радио VM» (VED-437). Только вошедшим — как и звук каталога
 * (`music-stream.controller.ts`): в ответе подписанные ссылки на файлы.
 *
 * Отметка слушателя приходит раз в 20 секунд от каждого плеера — лимит с
 * запасом на несколько вкладок.
 */
@Controller('music/radio')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class MusicRadioController {
  constructor(private readonly radio: MusicRadioService) {}

  @Get()
  state() {
    return this.radio.state();
  }

  @Post('heartbeat')
  heartbeat(@CurrentUser() user: AccessTokenPayload) {
    return this.radio.heartbeat(user.sub);
  }

  @Delete('heartbeat')
  leave(@CurrentUser() user: AccessTokenPayload) {
    return this.radio.leave(user.sub);
  }
}

/** Голосовые вставки в эфир — админка Музыки. */
@Controller('music/admin/radio/inserts')
@UseGuards(AuthGuard)
@AdminUnlimited('music')
@Throttle({ default: { ttl: 3_600_000, limit: 120 } })
export class MusicAdminRadioController {
  constructor(private readonly radio: MusicRadioService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.radio.inserts(isAdmin(user));
  }

  /**
   * `file` — запись, `title`, `scheduledAt` (ISO; пусто — в эфир сразу),
   * `durationSeconds` — длительность, измеренная браузером, на случай
   * записи с микрофона, в которой её нет.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MUSIC_RADIO_INSERT_MAX_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body()
    body: { title?: string; scheduledAt?: string; durationSeconds?: string },
    @UploadedFile() file?: UploadedRadioFile,
  ) {
    return this.radio.createInsert(isAdmin(user), user.sub, body ?? {}, file);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.radio.removeInsert(isAdmin(user), id);
  }
}
