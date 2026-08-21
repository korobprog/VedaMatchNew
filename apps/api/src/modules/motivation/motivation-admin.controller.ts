import {
  Body,
  ForbiddenException,
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
  MotivationAdminUpdate,
  MotivationApproveTextInput,
  MotivationAuthorWatchInput,
  MotivationBookKindInput,
  MotivationCategoryInput,
  MotivationCategoryUpdate,
  MotivationManualPostInput,
  MotivationManualQuoteInput,
  MotivationPromptUpdate,
  MotivationRegenerateImageInput,
  MotivationRejectInput,
  MotivationSourceWatchInput,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MotivationAdminGuard } from './motivation-admin.guard';
import { MotivationHealthService } from './motivation-health.service';
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

/**
 * Админские маршруты Motivation. Вынесены из MotivationController отдельным
 * классом, чтобы права проверялись один раз на уровне контроллера: доступ есть
 * у роли admin и у service-admin, которому выдан сервис motivation.
 */
@Controller('admin/motivation')
@UseGuards(AuthGuard, MotivationAdminGuard)
export class MotivationAdminController {
  constructor(
    private readonly service: MotivationService,
    private readonly categories: MotivationCategoriesService,
    private readonly manualPosts: MotivationManualPostService,
    private readonly storyRebuild: MotivationStoryRebuildService,
    private readonly books: MotivationBooksService,
    private readonly settings: MotivationSettingsService,
    private readonly music: MotivationMusicService,
    private readonly health_: MotivationHealthService,
  ) {}
  /** Состояние генерации: очередь и живой воркер. */
  @Get('health')
  health() {
    return this.health_.health();
  }
  @Get('posts')
  adminList(@CurrentUser() user: AccessTokenPayload) {
    return this.service.adminList(user.role);
  }
  @Patch('posts/:id')
  adminUpdate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationAdminUpdate,
  ) {
    return this.service.adminUpdate(user.role, id, input);
  }
  @Delete('posts/:id')
  adminDelete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.adminDelete(user.role, id);
  }
  @Post('posts/:id/regenerate')
  regenerate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.regenerate(user.role, user.sub, id);
  }
  @Post('posts/:id/approve-text')
  approveText(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationApproveTextInput = {},
  ) {
    return this.service.approveText(user.role, user.sub, id, input.visualStyle);
  }
  @Post('posts/:id/approve-image')
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
  @Post('posts/:id/prompts')
  savePrompts(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationPromptUpdate,
  ) {
    return this.service.savePrompts(user.role, user.sub, id, input);
  }
  @Post('posts/:id/animate')
  animate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.requestAnimation(user.role, id);
  }
  @Get('settings')
  readSettings(@CurrentUser() user: AccessTokenPayload) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Только администратор');
    return this.settings.read();
  }
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationSettingsUpdate,
  ) {
    return this.settings.update(user.role, input);
  }
  @Get('tracks')
  listTracks(@CurrentUser() user: AccessTokenPayload) {
    return this.music.list(user.role);
  }
  @Post('tracks/draft-prompt')
  draftMusicPrompt(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { postId?: string; mood?: string } = {},
  ) {
    return this.music.draftPrompt(user.role, input);
  }
  @Post('tracks')
  generateTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { title?: string; prompt: string; seconds?: number },
  ) {
    return this.music.generate(user.role, user.sub, input);
  }
  @Post('tracks/:id/status')
  setTrackStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { status: 'draft' | 'approved' | 'rejected' },
  ) {
    return this.music.setStatus(user.role, id, input.status);
  }
  @Delete('tracks/:id')
  deleteTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.music.remove(user.role, id);
  }
  @Post('voice-preview')
  previewVoice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { voice?: string | null } = {},
  ) {
    return this.service.previewVoice(user.role, input.voice);
  }
  @Post('posts/:id/draft-prompt')
  draftPostPrompt(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { kind: 'image' | 'video'; mood?: string },
  ) {
    return this.service.draftPostPrompt(user.role, id, input);
  }
  @Post('posts/:id/voice')
  setVideoVoice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { enabled?: boolean; voice?: string | null } = {},
  ) {
    return this.service.setVideoVoice(user.role, id, input);
  }
  @Post('posts/:id/approve-video')
  approveVideo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.approveVideo(user.role, id);
  }
  @Post('posts/:id/reject')
  reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationRejectInput,
  ) {
    return this.service.rejectModeration(user.role, user.sub, id, input.reason);
  }
  @Post('posts/:id/regenerate-image')
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
  @Post('generate')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { date?: string },
  ) {
    return this.service.enqueueDaily(user.role, input.date);
  }

  @Post('quotes')
  addManualQuote(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationManualQuoteInput,
  ) {
    return this.service.addManualQuote(user.role, input);
  }

  @Post('stories/rebuild')
  rebuildStories(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { limit?: number; force?: boolean } = {},
  ) {
    return this.storyRebuild.rebuild(user.role, input.limit, input.force);
  }

  @Post('manual-posts')
  createManualPost(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationManualPostInput,
  ) {
    return this.manualPosts.create(user.role, user.sub, input);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AccessTokenPayload) {
    return this.categories.list(user.role);
  }
  @Post('categories')
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationCategoryInput,
  ) {
    return this.categories.create(user.role, input);
  }
  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationCategoryUpdate,
  ) {
    return this.categories.update(user.role, id, input);
  }
  @Delete('categories/:id')
  deleteCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.categories.remove(user.role, id);
  }

  @Get('books')
  listBooks(@CurrentUser() user: AccessTokenPayload) {
    return this.books.list(user.role);
  }
  @Patch('books/:id')
  setBookKind(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationBookKindInput,
  ) {
    return this.books.setKind(user.role, id, input.kind);
  }

  @Get('authors')
  listAuthorWatches(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listAuthorWatches(user.role);
  }
  @Post('authors')
  addAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationAuthorWatchInput,
  ) {
    return this.service.addAuthorWatch(user.role, user.sub, input);
  }
  @Delete('authors/:id')
  deleteAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteAuthorWatch(user.role, id);
  }
  @Post('authors/:id/search')
  searchAuthorWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.searchAuthorWatch(user.role, id);
  }

  @Get('sources')
  listSourceWatches(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listSourceWatches(user.role);
  }
  @Post('sources')
  addSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationSourceWatchInput,
  ) {
    return this.service.addSourceWatch(user.role, user.sub, input);
  }
  @Delete('sources/:id')
  deleteSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteSourceWatch(user.role, id);
  }
  @Post('sources/:id/search')
  searchSourceWatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.searchSourceWatch(user.role, id);
  }
}
