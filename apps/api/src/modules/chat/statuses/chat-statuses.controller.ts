import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  CHAT_STATUS_VIDEO_MAX_BYTES,
  type AccessTokenPayload,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { ChatSignedUrlsInterceptor } from '../chat-signed-urls.interceptor';
import {
  ChatStatusesService,
  type UploadedStatusFile,
} from './chat-statuses.service';

/**
 * Статусы (VED-129). Файлы в ответах подписывает `ChatSignedUrlsInterceptor`
 * — как вложения переписки: бакет закрыт, прямая ссылка ответила бы 403.
 */
@Controller('chat/statuses')
@UseGuards(AuthGuard)
@UseInterceptors(ChatSignedUrlsInterceptor)
export class ChatStatusesController {
  constructor(private readonly statuses: ChatStatusesService) {}

  @Get()
  feed(@CurrentUser() user: AccessTokenPayload) {
    return this.statuses.feed(user.sub);
  }

  /** `?ids=a,b,c` — кружки для аватарок списка бесед. */
  @Get('rings')
  rings(@CurrentUser() user: AccessTokenPayload, @Query('ids') ids?: string) {
    const list = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.statuses.rings(user.sub, list);
  }

  @Get('users/:userId')
  ofUser(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    return this.statuses.ofUser(user.sub, userId);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CHAT_STATUS_VIDEO_MAX_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { text?: string },
    @UploadedFile() file?: UploadedStatusFile,
  ) {
    return this.statuses.create(user.sub, body, file);
  }

  @Post(':id/view')
  view(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.statuses.view(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.statuses.remove(user.sub, id);
  }
}
