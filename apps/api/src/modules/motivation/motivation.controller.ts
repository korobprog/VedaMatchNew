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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  MotivationAdminReelFilter,
  MotivationEventInput,
  MotivationAuthorPolicyUpdate,
  MotivationReelAppealInput,
  MotivationReelCreateInput,
  MotivationReelVideoOptions,
  MotivationReportInput,
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
import { MotivationReelsService } from './motivation-reels.service';
import { MotivationAdminReelsService } from './motivation-admin-reels.service';
import { MotivationPostcardsService } from './motivation-postcards.service';
import { MotivationAnalyticsService } from './motivation-analytics.service';
import { MAX_REEL_IMAGE_BYTES, type UploadedReelImage } from './reel-image';

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
    private readonly reels: MotivationReelsService,
    private readonly adminReels: MotivationAdminReelsService,
    private readonly postcards: MotivationPostcardsService,
    private readonly analytics: MotivationAnalyticsService,
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
    @Query('post') post?: string,
  ) {
    return this.service.feed(user.sub, {
      cursor,
      favorites: filter === 'favorites',
      category,
      post,
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
  // ===== Открытки =====
  @Get('motivation/postcards/event')
  @UseGuards(AuthGuard)
  currentEvent() {
    return this.postcards.current();
  }
  @Post('motivation/posts/:id/postcard')
  @UseGuards(AuthGuard)
  buildPostcard(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { greeting?: string | null },
  ) {
    return this.postcards.build(user.sub, user.role, id, body?.greeting);
  }
  @Get('admin/motivation/events')
  @UseGuards(AuthGuard)
  adminEvents(@CurrentUser() user: AccessTokenPayload) {
    return this.postcards.list(user.role);
  }
  @Post('admin/motivation/events')
  @UseGuards(AuthGuard)
  adminCreateEvent(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationEventInput,
  ) {
    return this.postcards.create(user.role, input);
  }
  @Delete('admin/motivation/events/:id')
  @UseGuards(AuthGuard)
  adminDeleteEvent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.postcards.remove(user.role, id);
  }

  // ===== Свой рилс =====
  @Get('motivation/reels/quota')
  @UseGuards(AuthGuard)
  reelQuota(@CurrentUser() user: AccessTokenPayload) {
    return this.reels.quota(user.sub, user.role);
  }
  @Get('motivation/reels/books')
  @UseGuards(AuthGuard)
  reelBooks() {
    return this.reels.listBooks();
  }
  @Get('motivation/reels/books/:bookSlug/chapters/:chapterSlug')
  @UseGuards(AuthGuard)
  reelChapter(
    @Param('bookSlug') bookSlug: string,
    @Param('chapterSlug') chapterSlug: string,
  ) {
    return this.reels.browseChapter(bookSlug, chapterSlug);
  }
  @Get('motivation/reels/voices')
  @UseGuards(AuthGuard)
  reelVoices() {
    return this.reels.voiceOptions();
  }
  /** Справочники объявлены до `:id`: иначе «music» уедет в параметр. */
  @Get('motivation/reels/music')
  @UseGuards(AuthGuard)
  reelMusic() {
    return this.reels.musicTracks();
  }
  @Get('motivation/reels/sources')
  @UseGuards(AuthGuard)
  reelSources(@Query('q') query?: string) {
    return this.reels.searchSources(query ?? '');
  }
  @Get('motivation/reels')
  @UseGuards(AuthGuard)
  myReels(@CurrentUser() user: AccessTokenPayload) {
    return this.reels.list(user.sub, user.role);
  }
  @Post('motivation/reels')
  @UseGuards(AuthGuard)
  createReel(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationReelCreateInput,
  ) {
    return this.reels.create(user.sub, user.role, input);
  }
  @Get('motivation/reels/:id')
  @UseGuards(AuthGuard)
  reel(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.reels.get(user.sub, id, user.role);
  }
  @Post('motivation/reels/:id/image')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_REEL_IMAGE_BYTES } }),
  )
  uploadReelImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedReelImage,
  ) {
    return this.reels.uploadImage(user.sub, id, file);
  }
  /**
   * Повтор ИИ-проверки. Живёт среди админских маршрутов рилсов, но обращается
   * к тому же сервису: проверку выполняет он, админка только просит.
   */
  @Post('admin/motivation/reels/:id/recheck')
  @UseGuards(AuthGuard)
  recheckReel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.reels.recheck(user.role, id);
  }
  @Post('motivation/reels/:id/animate')
  @UseGuards(AuthGuard)
  animateReel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() options?: MotivationReelVideoOptions,
  ) {
    return this.reels.animate(user.sub, user.role, id, options);
  }
  @Post('motivation/reels/:id/appeal')
  @UseGuards(AuthGuard)
  appealReel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationReelAppealInput,
  ) {
    return this.reels.appeal(user.sub, id, input);
  }
  @Post('motivation/posts/:id/like')
  @UseGuards(AuthGuard)
  addLike(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.like(user.sub, id, true);
  }
  @Delete('motivation/posts/:id/like')
  @UseGuards(AuthGuard)
  removeLike(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.like(user.sub, id, false);
  }
  @Post('motivation/posts/:id/report')
  @UseGuards(AuthGuard)
  report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: MotivationReportInput,
  ) {
    return this.service.report(user.sub, id, input);
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
  // ===== Админка: рилсы участников и решения ИИ =====
  @Get('admin/motivation/reels')
  @UseGuards(AuthGuard)
  adminReelList(
    @CurrentUser() user: AccessTokenPayload,
    @Query('filter') filter?: MotivationAdminReelFilter,
  ) {
    return this.adminReels.list(user.role, filter);
  }
  @Post('admin/motivation/reels/:id/restore')
  @UseGuards(AuthGuard)
  adminReelRestore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.adminReels.restore(user.role, user.sub, id);
  }
  @Post('admin/motivation/reels/:id/hide')
  @UseGuards(AuthGuard)
  adminReelHide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminReels.hide(user.role, user.sub, id, body?.reason ?? '');
  }
  @Get('admin/motivation/authors/:userId/policy')
  @UseGuards(AuthGuard)
  adminAuthorPolicy(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    return this.adminReels.policy(user.role, userId);
  }
  @Patch('admin/motivation/authors/:userId/policy')
  @UseGuards(AuthGuard)
  adminSaveAuthorPolicy(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
    @Body() body: MotivationAuthorPolicyUpdate,
  ) {
    return this.adminReels.savePolicy(user.role, userId, body);
  }

  @Get('admin/motivation/analytics')
  @UseGuards(AuthGuard)
  adminAnalytics(
    @CurrentUser() user: AccessTokenPayload,
    @Query('days') days?: string,
  ) {
    return this.analytics.read(user.role, days ? Number(days) : undefined);
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
  @Get('admin/motivation/tracks')
  @UseGuards(AuthGuard)
  listTracks(@CurrentUser() user: AccessTokenPayload) {
    return this.music.list(user.role);
  }
  @Post('admin/motivation/tracks/draft-prompt')
  @UseGuards(AuthGuard)
  draftMusicPrompt(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { postId?: string; mood?: string } = {},
  ) {
    return this.music.draftPrompt(user.role, input);
  }
  @Post('admin/motivation/tracks')
  @UseGuards(AuthGuard)
  generateTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { title?: string; prompt: string; seconds?: number },
  ) {
    return this.music.generate(user.role, user.sub, input);
  }
  @Post('admin/motivation/tracks/:id/status')
  @UseGuards(AuthGuard)
  setTrackStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { status: 'draft' | 'approved' | 'rejected' },
  ) {
    return this.music.setStatus(user.role, id, input.status);
  }
  @Delete('admin/motivation/tracks/:id')
  @UseGuards(AuthGuard)
  deleteTrack(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.music.remove(user.role, id);
  }
  @Post('admin/motivation/voice-preview')
  @UseGuards(AuthGuard)
  previewVoice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: { voice?: string | null } = {},
  ) {
    return this.service.previewVoice(user.role, input.voice);
  }
  @Post('admin/motivation/posts/:id/draft-prompt')
  @UseGuards(AuthGuard)
  draftPostPrompt(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() input: { kind: 'image' | 'video'; mood?: string },
  ) {
    return this.service.draftPostPrompt(user.role, id, input);
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
