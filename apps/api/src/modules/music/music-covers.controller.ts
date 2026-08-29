import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMusicCoverUploadRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicCoversService } from './music-covers.service';

/**
 * Обложки: выдача подписанной ссылки на заливку.
 *
 * Права проверяет не этот маршрут, а сохранение карточки: сама по себе
 * выписанная ссылка ничего не меняет — объект ничей, пока его ключ не
 * записали в запись, исполнителя, альбом или плейлист. Поэтому здесь хватает
 * `AuthGuard`, а «можно ли этому человеку трогать эту карточку» решается там,
 * где карточка правится.
 *
 * Лимит скромный: обложку меняют раз в жизни карточки, а не раз в минуту.
 */
@Controller('music/covers')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 60 } })
export class MusicCoversController {
  constructor(private readonly covers: MusicCoversService) {}

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicCoverUploadRequest,
  ) {
    return this.covers.createUpload(user.sub, body);
  }
}
