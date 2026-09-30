import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  TRAVEL_MAP_STOP_VIDEO_MAX_BYTES,
  type AccessTokenPayload,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import {
  MAX_MAP_PHOTO_BYTES,
  type UploadedMapPhoto,
} from './travel-map-photos.service';
import { TravelMapRoutesService } from './travel-map-routes.service';

/** Маршруты народной карты: читать и добавлять может любой вошедший. */
@Controller('travel/map/routes')
@UseGuards(AuthGuard)
export class TravelMapRoutesController {
  constructor(private readonly routes: TravelMapRoutesService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.routes.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.routes.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.routes.remove(user, id);
  }

  @Post(':id/stops/:stopId/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_MAP_PHOTO_BYTES } }),
  )
  addStopPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @UploadedFile() file?: UploadedMapPhoto,
  ) {
    return this.routes.addStopPhoto(user, id, stopId, file);
  }

  @Delete(':id/stops/:stopId/photos/:index')
  removeStopPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.routes.removeStopPhoto(user, id, stopId, index);
  }

  @Post(':id/stops/:stopId/video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: TRAVEL_MAP_STOP_VIDEO_MAX_BYTES },
    }),
  )
  setStopVideo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @UploadedFile() file?: UploadedMapPhoto,
  ) {
    return this.routes.setStopVideo(user, id, stopId, file);
  }

  @Delete(':id/stops/:stopId/video')
  removeStopVideo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
  ) {
    return this.routes.removeStopVideo(user, id, stopId);
  }

  @Patch(':id/stops/:stopId/story')
  updateStopStory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.updateStopStory(user, id, stopId, body);
  }
}
