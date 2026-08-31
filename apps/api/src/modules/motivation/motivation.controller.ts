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
    return this.postcards.build(user.sub, user, id, body?.greeting);
  }
  @Get('admin/motivation/events')
  @UseGuards(AuthGuard)
  adminEvents(@CurrentUser() user: AccessTokenPayload) {
    return this.postcards.list(user);
  }
  @Post('admin/motivation/events')
  @UseGuards(AuthGuard)
  adminCreateEvent(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationEventInput,
  ) {
    return this.postcards.create(user, input);
  }
  @Delete('admin/motivation/events/:id')
  @UseGuards(AuthGuard)
  adminDeleteEvent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.postcards.remove(user, id);
  }

  // ===== Свой рилс =====
  @Get('motivation/reels/quota')
  @UseGuards(AuthGuard)
  reelQuota(@CurrentUser() user: AccessTokenPayload) {
    return this.reels.quota(user.sub, user);
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
    return this.reels.list(user.sub, user);
  }
  @Post('motivation/reels')
  @UseGuards(AuthGuard)
  createReel(
    @CurrentUser() user: AccessTokenPayload,
    @Body() input: MotivationReelCreateInput,
  ) {
    return this.reels.create(user.sub, user, input);
  }
  @Get('motivation/reels/:id')
  @UseGuards(AuthGuard)
  reel(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.reels.get(user.sub, id, user);
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
    return this.reels.recheck(user, id);
  }
  @Post('motivation/reels/:id/animate')
  @UseGuards(AuthGuard)
  animateReel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() options?: MotivationReelVideoOptions,
  ) {
    return this.reels.animate(user.sub, user, id, options);
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
}
