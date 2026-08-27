import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  MusicHeartbeatRequest,
  UpdateMusicPlaybackStateRequest,
  UpdateMusicSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicPlaybackService } from './music-playback.service';
import { MusicFavoritesService } from './music-favorites.service';

/**
 * Плеер: состояние, тик и остановка.
 *
 * Лимит запросов поднят против обычного: heartbeat приходит раз в 30 секунд,
 * то есть 120 раз в час только от одной вкладки, а вкладок у человека может
 * быть несколько. Обычные сотня в минуту тут дали бы отказ на ровном месте.
 */
@Controller('music/playback')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 1000 } })
export class MusicPlaybackController {
  constructor(private readonly playback: MusicPlaybackService) {}

  @Get('state')
  getState(@CurrentUser() user: AccessTokenPayload) {
    return this.playback.getState(user.sub);
  }

  @Put('state')
  putState(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateMusicPlaybackStateRequest,
  ) {
    return this.playback.putState(user.sub, body);
  }

  @Post('heartbeat')
  heartbeat(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: MusicHeartbeatRequest,
  ) {
    return this.playback.heartbeat(user.sub, body);
  }

  /** Пауза и уход со страницы: «слушает сейчас» снимается сразу. */
  @Post('stop')
  stop(@CurrentUser() user: AccessTokenPayload) {
    return this.playback.stop(user.sub);
  }
}

/**
 * Настройки прослушивания. Отдельный контроллер под своим префиксом:
 * `music/settings` — это про человека, а не про плеер, и меняется раз в
 * жизни, а не раз в тридцать секунд.
 */
@Controller('music/settings')
@UseGuards(AuthGuard)
export class MusicSettingsController {
  constructor(private readonly playback: MusicPlaybackService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.playback.getSettings(user.sub);
  }

  @Put()
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateMusicSettingsRequest,
  ) {
    return this.playback.updateSettings(user.sub, body);
  }
}

/**
 * Избранное. Обе команды идемпотентны: сердце нажимают дважды, и ошибка в
 * ответ на это — худшее, что может сделать интерфейс.
 */
@Controller('music/favorites')
@UseGuards(AuthGuard)
export class MusicFavoritesController {
  constructor(private readonly favorites: MusicFavoritesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.favorites.list(user.sub);
  }

  @Post(':trackId')
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('trackId') trackId: string,
  ) {
    return this.favorites.add(user.sub, trackId);
  }

  @Delete(':trackId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('trackId') trackId: string,
  ) {
    return this.favorites.remove(user.sub, trackId);
  }
}
