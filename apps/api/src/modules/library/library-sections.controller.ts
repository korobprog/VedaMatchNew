import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  UpdateLibrarySectionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibrarySectionsService } from './library-sections.service';
import { isAdmin } from './is-admin';

@Controller('library/sections')
@UseGuards(AuthGuard)
export class LibrarySectionsController {
  constructor(private readonly sections: LibrarySectionsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.sections.list(isAdmin(user));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibrarySectionRequest,
  ) {
    return this.sections.update(isAdmin(user), id, body);
  }
}
