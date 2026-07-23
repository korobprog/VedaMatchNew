import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type {
  AccessTokenPayload,
  ReorderUserPhotosRequest,
  UpdateUserPhotoRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import {
  UserGalleryService,
  type UploadedGalleryFile,
} from './user-gallery.service';

@Controller('profile/photos')
@UseGuards(AuthGuard)
export class UserGalleryController {
  constructor(private readonly gallery: UserGalleryService) {}

  @Get()
  getGallery(@CurrentUser() user: AccessTokenPayload) {
    return this.gallery.getGallery(user.sub);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 50))
  upload(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFiles() files: UploadedGalleryFile[] | undefined,
  ) {
    return this.gallery.uploadMany(user.sub, files ?? []);
  }

  @Patch(':id')
  updateVisibility(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
    @Body() body: UpdateUserPhotoRequest,
  ) {
    return this.gallery.updateVisibility(user.sub, photoId, body);
  }

  @Put('order')
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ReorderUserPhotosRequest,
  ) {
    return this.gallery.reorder(user.sub, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
  ): Promise<void> {
    await this.gallery.remove(user.sub, photoId);
  }
}
