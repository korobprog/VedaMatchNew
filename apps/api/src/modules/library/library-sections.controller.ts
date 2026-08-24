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
  SaveLibrarySectionRequest,
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

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveLibrarySectionRequest,
  ) {
    return this.sections.create(isAdmin(user), body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibrarySectionRequest,
  ) {
    return this.sections.update(isAdmin(user), id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.sections.remove(isAdmin(user), id);
  }
}
