import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  CreateMusicPlaylistRequest,
  UpdateMusicPlaylistRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicPlaylistsService } from './music-playlists.service';

/**
 * Плейлисты человека. См. docs/music-service-plan.md, этап 4.
 *
 * Всё под гардом: чужие плейлисты наружу не отдаются вовсе, пока нет
 * страницы публичного плейлиста, — а когда появится, она будет отдельным
 * открытым маршрутом с явным комментарием, как у витрины и карты общин.
 */
@Controller('music/playlists')
@UseGuards(AuthGuard)
export class MusicPlaylistsController {
  constructor(private readonly playlists: MusicPlaylistsService) {}

  /**
   * Свои плейлисты. С `?trackId=` — список для шторки «В плейлист»: те же
   * строки плюс галочка «уже внутри».
   */
  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('trackId') trackId?: string,
  ) {
    const wanted = trackId?.trim();
    return wanted
      ? this.playlists.listForPicker(user.sub, wanted)
      : this.playlists.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicPlaylistRequest,
  ) {
    return this.playlists.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicPlaylistRequest,
  ) {
    return this.playlists.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.playlists.remove(user.sub, id);
  }

  @Post(':id/tracks/:trackId')
  addTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('trackId') trackId: string,
  ) {
    return this.playlists.addTrack(user.sub, id, trackId);
  }

  @Delete(':id/tracks/:trackId')
  removeTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('trackId') trackId: string,
  ) {
    return this.playlists.removeTrack(user.sub, id, trackId);
  }
}
