import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  PublishChatMomentRequest,
  SaveChatMomentSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import {
  ChatSignedUrlsInterceptor,
  RawStorageUrls,
} from '../chat-signed-urls.interceptor';
import {
  MAX_MOMENT_VIDEO_BYTES,
  validateMomentUpload,
} from './moments-upload-rules';
import type { UploadedChatFile } from '../chat-uploads.service';
import { MomentsService } from './moments.service';

/**
 * Маршруты моментов. Префикс — slug сервиса, как у справочника людей:
 * это раздел «Общения», а не отдельный сервис.
 */
@Controller('chat/moments')
@UseGuards(AuthGuard)
@UseInterceptors(ChatSignedUrlsInterceptor)
export class MomentsController {
  constructor(private readonly moments: MomentsService) {}

  /** Полоса колец над списком бесед. */
  @Get()
  rings(@CurrentUser() user: AccessTokenPayload) {
    return this.moments.rings(user.sub);
  }

  @Get('settings')
  settings(@CurrentUser() user: AccessTokenPayload) {
    return this.moments.settings(user.sub);
  }

  @Post('settings')
  saveSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveChatMomentSettingsRequest,
  ) {
    return this.moments.saveSettings(user.sub, body);
  }

  /** Моменты одного человека — то, что открывает просмотрщик. */
  @Get('user/:id')
  feed(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moments.feed(user.sub, id);
  }

  /**
   * Фотография или ролик момента. Ссылка возвращается неподписанной: браузер
   * вернёт её обратно в публикацию, а подписанная осела бы в базе вместе со
   * сроком годности.
   *
   * Предел multer — по ролику, самому большому из допустимых; точный предел
   * своего вида проверяется дальше, в `validateMomentUpload`. Иначе картинка
   * в двадцать мегабайт отбивалась бы не «слишком большая», а обрывом
   * соединения.
   */
  @Post('uploads')
  @RawStorageUrls()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_MOMENT_VIDEO_BYTES } }),
  )
  async upload(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file?: UploadedChatFile,
  ) {
    const denial = validateMomentUpload(file);
    if (denial === 'unsupported_type')
      throw new UnsupportedMediaTypeException(
        'Такой файл в момент не идёт: нужна фотография или ролик mp4 либо webm',
      );
    if (denial === 'file_too_large')
      throw new UnsupportedMediaTypeException('Файл слишком большой');

    return this.moments.upload(user.sub, file);
  }

  @Post()
  publish(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: PublishChatMomentRequest,
  ) {
    return this.moments.publish(user.sub, body);
  }

  /** Отметка просмотра. Порог как у просмотров постов канала. */
  @Post(':id/view')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  view(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moments.markViewed(user.sub, id);
  }

  /** Ответ на момент — обычное личное сообщение автору. */
  @Post(':id/reply')
  reply(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.moments.reply(user.sub, id, body?.body ?? '');
  }

  @Get(':id/viewers')
  viewers(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moments.viewers(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.moments.remove(user.sub, id);
  }
}
