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
  ) {}

  @Get('health') health() {
    return { status: 'ok' };
  }
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

  @Get('admin/motivation/posts')
  @UseGuards(AuthGuard)
  adminList(@CurrentUser() user: AccessTokenPayload) {
    return this.service.adminList(user.role);
  }
  @Patch('admin/motivation/posts/:id')
  @UseGuards(AuthGuard)
  adminUpdate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationAdminUpdate,
  ) {
    return this.service.adminUpdate(user.role, id, input);
  }
  @Delete('admin/motivation/posts/:id')
  @UseGuards(AuthGuard)
  adminDelete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.adminDelete(user.role, id);
  }
  @Post('admin/motivation/posts/:id/regenerate')
  @UseGuards(AuthGuard)
  regenerate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.regenerate(user.role, user.sub, id);
  }
  @Post('admin/motivation/posts/:id/approve-text')
  @UseGuards(AuthGuard)
  approveText(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationApproveTextInput = {},
  ) {
    return this.service.approveText(user.role, user.sub, id, input.visualStyle);
  }
  @Post('admin/motivation/posts/:id/approve-image')
  @UseGuards(AuthGuard)
  approveImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.approveImage(user.role, user.sub, id);
  }
  /**
   * Сохранение отредактированных промптов. Одним эндпоинтом на оба поля: в
   * карточке это две разные формы, но действие одно — «сохранить то, что уйдёт
   * в генерацию», и разводить его по двум маршрутам нечем.
   */
  @Post('admin/motivation/posts/:id/prompts')
  @UseGuards(AuthGuard)
  savePrompts(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationPromptUpdate,
  ) {
    return this.service.savePrompts(user.role, user.sub, id, input);
  }
  @Post('admin/motivation/posts/:id/animate')
  @UseGuards(AuthGuard)
  animate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.requestAnimation(user.role, id);
  }
  @Get('admin/motivation/settings')
  @UseGuards(AuthGuard)
  readSettings(@CurrentUser() user: AccessTokenPayload) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Только администратор');
    return this.settings.read();
  }
  @Patch('admin/motivation/settings')
  @UseGuards(AuthGuard)
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationSettingsUpdate,
  ) {
    return this.settings.update(user.role, input);
  }
  @Post('admin/motivation/voice-preview')
  @UseGuards(AuthGuard)
  previewVoice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { voice?: string | null } = {},
  ) {
    return this.service.previewVoice(user.role, input.voice);
  }
  @Post('admin/motivation/posts/:id/voice')
  @UseGuards(AuthGuard)
  setVideoVoice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { enabled?: boolean; voice?: string | null } = {},
  ) {
    return this.service.setVideoVoice(user.role, id, input);
  }
  @Post('admin/motivation/posts/:id/approve-video')
  @UseGuards(AuthGuard)
  approveVideo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.approveVideo(user.role, id);
  }
  @Post('admin/motivation/posts/:id/reject')
  @UseGuards(AuthGuard)
  reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationRejectInput,
  ) {
    return this.service.rejectModeration(user.role, user.sub, id, input.reason);
  }
  @Post('admin/motivation/posts/:id/regenerate-image')
  @UseGuards(AuthGuard)
  regenerateImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationRegenerateImageInput = {},
  ) {
    return this.service.regenerateModerationImage(
      user.role,
      user.sub,
      id,
      input.visualStyle,
    );
  }
  @Post('admin/motivation/generate')
  @UseGuards(AuthGuard)
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { date?: string },
  ) {
    return this.service.enqueueDaily(user.role, input.date);
  }

  @Post('admin/motivation/quotes')
  @UseGuards(AuthGuard)
  addManualQuote(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationManualQuoteInput,
  ) {
    return this.service.addManualQuote(user.role, input);
  }

  @Post('admin/motivation/stories/rebuild')
  @UseGuards(AuthGuard)
  rebuildStories(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { limit?: number; force?: boolean } = {},
  ) {
    return this.storyRebuild.rebuild(user.role, input.limit, input.force);
  }

  @Post('admin/motivation/manual-posts')
  @UseGuards(AuthGuard)
  createManualPost(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationManualPostInput,
  ) {
    return this.manualPosts.create(user.role, user.sub, input);
  }

  @Get('admin/motivation/categories')
  @UseGuards(AuthGuard)
  listCategories(@CurrentUser() user: AccessTokenPayload) {
    return this.categories.list(user.role);
  }
  @Post('admin/motivation/categories')
  @UseGuards(AuthGuard)
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationCategoryInput,
  ) {
    return this.categories.create(user.role, input);
  }
  @Patch('admin/motivation/categories/:id')
  @UseGuards(AuthGuard)
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationCategoryUpdate,
  ) {
    return this.categories.update(user.role, id, input);
  }
  @Delete('admin/motivation/categories/:id')
  @UseGuards(AuthGuard)
  deleteCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.categories.remove(user.role, id);
  }

  @Get('admin/motivation/books')
  @UseGuards(AuthGuard)
  listBooks(@CurrentUser() user: AccessTokenPayload) {
    return this.books.list(user.role);
  }
  @Patch('admin/motivation/books/:id')
  @UseGuards(AuthGuard)
  setBookKind(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationBookKindInput,
  ) {
    return this.books.setKind(user.role, id, input.kind);
  }

  @Get('admin/motivation/authors')
  @UseGuards(AuthGuard)
  listAuthorWatches(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listAuthorWatches(user.role);
  }
  @Post('admin/motivation/authors')
  @UseGuards(AuthGuard)
  addAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationAuthorWatchInput,
  ) {
    return this.service.addAuthorWatch(user.role, user.sub, input);
  }
  @Delete('admin/motivation/authors/:id')
  @UseGuards(AuthGuard)
  deleteAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteAuthorWatch(user.role, id);
  }
  @Post('admin/motivation/authors/:id/search')
  @UseGuards(AuthGuard)
  searchAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.searchAuthorWatch(user.role, id);
  }

  @Get('admin/motivation/sources')
  @UseGuards(AuthGuard)
  listSourceWatches(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listSourceWatches(user.role);
  }
  @Post('admin/motivation/sources')
  @UseGuards(AuthGuard)
  addSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationSourceWatchInput,
  ) {
    return this.service.addSourceWatch(user.role, user.sub, input);
  }
  @Delete('admin/motivation/sources/:id')
  @UseGuards(AuthGuard)
  deleteSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteSourceWatch(user.role, id);
  }
  @Post('admin/motivation/sources/:id/search')
  @UseGuards(AuthGuard)
  searchSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.searchSourceWatch(user.role, id);
  }
}
