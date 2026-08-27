import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMusicUploadRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicUploadsService } from './music-uploads.service';

/**
 * Загрузка записей. Файл через эти маршруты не проходит: API выдаёт
 * подписанный PUT, браузер льёт напрямую в бакет и возвращается сюда за
 * `complete`.
 *
 * Лимит запросов низкий не ради базы, а ради бакета: каждая выданная ссылка
 * — это разрешение положить туда сто мегабайт.
 */
@Controller('music/uploads')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 40 } })
export class MusicUploadsController {
  constructor(private readonly uploads: MusicUploadsService) {}

  /** Сколько места занято и что вообще принимается. */
  @Get('usage')
  usage(@CurrentUser() user: AccessTokenPayload) {
    return this.uploads.usage(user.sub);
  }

  /** Свои записи со статусом и решением модератора. */
  @Get('mine')
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.uploads.myUploads(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicUploadRequest,
  ) {
    return this.uploads.createUpload(user.sub, body);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { fileName?: string },
  ) {
    return this.uploads.completeUpload(user.sub, id, body?.fileName);
  }

  /** Снять свою неопубликованную запись и освободить место. */
  @Delete('tracks/:trackId')
  removeMine(
    @CurrentUser() user: AccessTokenPayload,
    @Param('trackId') trackId: string,
  ) {
    return this.uploads.deleteMyTrack(user.sub, trackId);
  }
}
