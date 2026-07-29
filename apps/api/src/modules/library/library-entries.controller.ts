import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryEntryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import {
  LibraryEntriesService,
  type LibraryFeedFilters,
} from './library-entries.service';

@Controller('library/entries')
@UseGuards(AuthGuard)
export class LibraryEntriesController {
  constructor(private readonly entries: LibraryEntriesService) {}

  @Get()
  feed(@Query() query: LibraryFeedFilters) {
    return this.entries.feed(query);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.entries.byId(id);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryEntryRequest,
  ) {
    return this.entries.create(user.sub, body);
  }
}
