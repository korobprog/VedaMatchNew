import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AddMusicIngestFilesRequest,
  AddMusicIngestUrlsRequest,
  CreateMusicIngestBatchRequest,
  PublishMusicIngestBatchRequest,
  UpdateMusicIngestBatchRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicIngestService } from './music-ingest.service';

/**
 * Редакционное пополнение. Префикс — слаг сервиса, как у остальных
 * админ-ручек Музыки: единственная точка касания портала у модуля — строка в
 * `app.module.ts`.
 */
@Controller('music/admin/ingest')
@UseGuards(AuthGuard)
export class MusicIngestController {
  constructor(private readonly ingest: MusicIngestService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.ingest.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicIngestBatchRequest,
  ) {
    return this.ingest.create(user, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.detail(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicIngestBatchRequest,
  ) {
    return this.ingest.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.remove(user, id);
  }

  @Post(':id/files')
  addFiles(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddMusicIngestFilesRequest,
  ) {
    return this.ingest.addFiles(user, id, body);
  }

  @Post(':id/files/:itemId/complete')
  completeFile(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ingest.completeFile(user, id, itemId);
  }

  @Post(':id/urls')
  addUrls(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddMusicIngestUrlsRequest,
  ) {
    return this.ingest.addUrls(user, id, body);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.retryFailed(user, id);
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: PublishMusicIngestBatchRequest,
  ) {
    return this.ingest.publish(user, id, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ingest.removeItem(user, id, itemId);
  }
}
