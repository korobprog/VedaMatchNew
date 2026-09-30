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
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import {
  MAX_MAP_PHOTO_BYTES,
  type UploadedMapPhoto,
} from './travel-map-photos.service';
import { TravelMapService } from './travel-map.service';

/** Народная карта: читать и добавлять места может любой вошедший. */
@Controller('travel/map')
@UseGuards(AuthGuard)
export class TravelMapController {
  constructor(private readonly map: TravelMapService) {}

  @Get('places')
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.map.listPlaces(user, query);
  }

  @Get('places/:id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.map.getPlace(user, id);
  }

  @Post('places')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.map.createPlace(user, body);
  }

  @Patch('places/:id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.map.updatePlace(user, id, body);
  }

  @Delete('places/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.map.deletePlace(user, id);
  }

  @Post('places/:id/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_MAP_PHOTO_BYTES } }),
  )
  addPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedMapPhoto,
  ) {
    return this.map.addPhoto(user, id, file);
  }

  @Delete('places/:id/photos/:index')
  removePhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.map.removePhoto(user, id, index);
  }

  @Post('places/:id/report')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  async report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.map.reportPlace(user, id, body);
    return { ok: true };
  }
}
