import {
  Body,
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationAdminUpdate,
  MotivationApproveTextInput,
  MotivationAuthorWatchInput,
  MotivationBookKindInput,
  MotivationCategoryInput,
  MotivationCategoryUpdate,
  MotivationLanguage,
  MotivationManualPostInput,
  MotivationManualQuoteInput,
  MotivationPreferenceUpdate,
  MotivationPromptUpdate,
  MotivationRegenerateImageInput,
  MotivationRejectInput,
  MotivationSourceWatchInput,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MotivationBooksService } from './motivation-books.service';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationManualPostService } from './motivation-manual-post.service';
import { MotivationStoryRebuildService } from './motivation-story-rebuild.service';
import { MotivationService } from './motivation.service';
import { MotivationMusicService } from './motivation-music.service';
import {
  MotivationSettingsService,
  type MotivationSettingsUpdate,
} from './motivation-settings.service';

@Controller()
export class MotivationController {
  constructor(
    private readonly service: MotivationService,
    private readonly categories: MotivationCategoriesService,
    private readonly manualPosts: MotivationManualPostService,
    private readonly storyRebuild: MotivationStoryRebuildService,
    private readonly books: MotivationBooksService,
    private readonly settings: MotivationSettingsService,
    private readonly music: MotivationMusicService,
  ) {}

  @Get('motivation/posts/:slug') publicPost(
    @Param('slug') slug: string,
    @Query('language') language?: MotivationLanguage,
  ) {
    return this.service.publicPost(slug, language);
  }

  @Get('motivation/feed')
  @UseGuards(AuthGuard)
  feed(
    @CurrentUser() user: AccessTokenPayload,
    @Query('cursor') cursor?: string,
    @Query('filter') filter?: 'all' | 'favorites',
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.service.feed(user.sub, {
      cursor,
      favorites: filter === 'favorites',
      category,
      limit: limit ? Number(limit) : undefined,
    });
  }
  @Get('motivation/preferences')
  @UseGuards(AuthGuard)
  preference(@CurrentUser() user: AccessTokenPayload) {
    return this.service.preference(user.sub);
  }
  @Patch('motivation/preferences')
  @UseGuards(AuthGuard)
  savePreference(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationPreferenceUpdate,
  ) {
    return this.service.savePreference(user.sub, input);
  }
  @Post('motivation/posts/:id/favorite')
  @UseGuards(AuthGuard)
  addFavorite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.favorite(user.sub, id, true);
  }
  @Delete('motivation/posts/:id/favorite')
  @UseGuards(AuthGuard)
  removeFavorite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.favorite(user.sub, id, false);
  }
  @Post('motivation/posts/:id/view')
  @UseGuards(AuthGuard)
  view(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.view(user.sub, id);
  }
}
