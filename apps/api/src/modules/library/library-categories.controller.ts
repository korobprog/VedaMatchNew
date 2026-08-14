import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryCategoryRequest,
  UpdateLibraryCategoryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryCategoriesService } from './library-categories.service';
import { isAdmin } from './is-admin';

@Controller('library/categories')
@UseGuards(AuthGuard)
export class LibraryCategoriesController {
  constructor(private readonly categories: LibraryCategoriesService) {}

  @Get('suggest')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  suggest(@Query('q') query: string) {
    return this.categories.suggest(query ?? '');
  }

  @Get('section/:sectionSlug')
  listBySection(
    @CurrentUser() user: AccessTokenPayload,
    @Param('sectionSlug') sectionSlug: string,
  ) {
    return this.categories.listBySection(sectionSlug, user.sub, isAdmin(user));
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryCategoryRequest,
  ) {
    return this.categories.create(user.sub, body);
  }

  @Patch(':id')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibraryCategoryRequest,
  ) {
    return this.categories.update(user.sub, isAdmin(user), id, body);
  }
}
