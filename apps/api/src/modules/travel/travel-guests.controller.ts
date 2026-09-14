import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import {
  MAX_GUEST_PHOTO_BYTES,
  type UploadedGuestPhoto,
} from './travel-guest-photos.service';
import { TravelGuestsService } from './travel-guests.service';

/** Клиентская база объекта — кабинет управляющего, как касса и заявки. */
@Controller('travel/manage/stays/:stayId/guests')
@UseGuards(AuthGuard)
export class TravelGuestsController {
  constructor(private readonly guests: TravelGuestsService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
  ) {
    return this.guests.list(user.sub, stayId);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.guests.create(user.sub, stayId, body);
  }

  @Patch(':guestId')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('guestId') guestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.guests.update(user.sub, stayId, guestId, body);
  }

  @Delete(':guestId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('guestId') guestId: string,
  ) {
    await this.guests.remove(user.sub, stayId, guestId);
  }

  @Post(':guestId/photo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_GUEST_PHOTO_BYTES } }),
  )
  setPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('guestId') guestId: string,
    @UploadedFile() file?: UploadedGuestPhoto,
  ) {
    return this.guests.setPhoto(user.sub, stayId, guestId, file);
  }

  @Delete(':guestId/photo')
  removePhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('guestId') guestId: string,
  ) {
    return this.guests.removePhoto(user.sub, stayId, guestId);
  }
}
