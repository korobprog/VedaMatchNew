import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  UpdateLibraryPreferencesRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryPreferencesService } from './library-preferences.service';

@Controller('library/me/preferences')
@UseGuards(AuthGuard)
export class LibraryPreferencesController {
  constructor(private readonly preferences: LibraryPreferencesService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.preferences.get(user.sub);
  }

  @Patch()
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateLibraryPreferencesRequest,
  ) {
    return this.preferences.update(user.sub, body);
  }
}
