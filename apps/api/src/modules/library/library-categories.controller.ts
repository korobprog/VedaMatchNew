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
  CreateLibraryCategoryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryCategoriesService } from './library-categories.service';

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
  listBySection(@Param('sectionSlug') sectionSlug: string) {
    return this.categories.listBySection(sectionSlug);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryCategoryRequest,
  ) {
    return this.categories.create(user.sub, body);
  }
}
