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
}
