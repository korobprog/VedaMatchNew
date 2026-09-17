import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  ProfileUpdateRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UsersService, type UploadedAvatarFile } from './users.service';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ProfileUpdateRequest,
  ) {
    return this.users.updateProfile(user.sub, body);
  }

  @Post('photo-verification')
  requestPhotoVerification(@CurrentUser() user: AccessTokenPayload) {
    return this.users.requestPhotoVerification(user.sub);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file?: UploadedAvatarFile,
  ) {
    return this.users.uploadAvatar(user.sub, file);
  }

  @Delete('avatar')
  deleteAvatar(@CurrentUser() user: AccessTokenPayload) {
    return this.users.deleteAvatar(user.sub);
  }

  // Разрушительное действие с окном отмены — 5/час защищает от случайного
  // спама кнопкой и не мешает обычному сценарию «запросил → передумал →
  // отменил → запросил снова» внутри одной сессии тестирования.
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @Post('delete-request')
  requestDeletion(@CurrentUser() user: AccessTokenPayload) {
    return this.users.requestSelfDeletion(user.sub);
  }

  @Delete('delete-request')
  cancelDeletion(@CurrentUser() user: AccessTokenPayload) {
    return this.users.cancelSelfDeletion(user.sub);
  }
}
