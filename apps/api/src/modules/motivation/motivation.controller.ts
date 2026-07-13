import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload, MotivationAdminUpdate, MotivationApproveTextInput, MotivationAuthorWatchInput, MotivationLanguage, MotivationPreferenceUpdate, MotivationRegenerateImageInput, MotivationRejectInput, MotivationSourceWatchInput } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MotivationService } from './motivation.service';

@Controller()
export class MotivationController {
  constructor(private readonly service: MotivationService) {}

  @Get('health') health() { return { status: 'ok' }; }
  @Get('motivation/posts/:slug') publicPost(@Param('slug') slug: string, @Query('language') language?: MotivationLanguage) { return this.service.publicPost(slug, language); }

  @Get('motivation/feed') @UseGuards(AuthGuard)
  feed(@CurrentUser() user: AccessTokenPayload, @Query('cursor') cursor?: string, @Query('filter') filter?: 'all' | 'favorites', @Query('limit') limit?: string, @Query('category') category?: string) {
    return this.service.feed(user.sub, { cursor, favorites: filter === 'favorites', category, limit: limit ? Number(limit) : undefined });
  }
  @Get('motivation/preferences') @UseGuards(AuthGuard)
  preference(@CurrentUser() user: AccessTokenPayload) { return this.service.preference(user.sub); }
  @Patch('motivation/preferences') @UseGuards(AuthGuard)
  savePreference(@CurrentUser() user: AccessTokenPayload, @Body() input: MotivationPreferenceUpdate) { return this.service.savePreference(user.sub, input); }
  @Post('motivation/posts/:id/favorite') @UseGuards(AuthGuard)
  addFavorite(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.favorite(user.sub, id, true); }
  @Delete('motivation/posts/:id/favorite') @UseGuards(AuthGuard)
  removeFavorite(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.favorite(user.sub, id, false); }
  @Post('motivation/posts/:id/view') @UseGuards(AuthGuard)
  view(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.view(user.sub, id); }

  @Get('admin/motivation/posts') @UseGuards(AuthGuard)
  adminList(@CurrentUser() user: AccessTokenPayload) { return this.service.adminList(user.role); }
  @Patch('admin/motivation/posts/:id') @UseGuards(AuthGuard)
  adminUpdate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() input: MotivationAdminUpdate) { return this.service.adminUpdate(user.role, id, input); }
  @Post('admin/motivation/posts/:id/regenerate') @UseGuards(AuthGuard)
  regenerate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.regenerate(user.role, user.sub, id); }
  @Post('admin/motivation/posts/:id/approve-text') @UseGuards(AuthGuard)
  approveText(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() input: MotivationApproveTextInput = {}) { return this.service.approveText(user.role, user.sub, id, input.visualStyle); }
  @Post('admin/motivation/posts/:id/approve-image') @UseGuards(AuthGuard)
  approveImage(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.approveImage(user.role, user.sub, id); }
  @Post('admin/motivation/posts/:id/reject') @UseGuards(AuthGuard)
  reject(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() input: MotivationRejectInput) { return this.service.rejectModeration(user.role, user.sub, id, input.reason); }
  @Post('admin/motivation/posts/:id/regenerate-image') @UseGuards(AuthGuard)
  regenerateImage(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() input: MotivationRegenerateImageInput = {}) { return this.service.regenerateModerationImage(user.role, user.sub, id, input.visualStyle); }
  @Post('admin/motivation/generate') @UseGuards(AuthGuard)
  generate(@CurrentUser() user: AccessTokenPayload, @Body() input: { date?: string }) { return this.service.enqueueDaily(user.role, input.date); }

  @Get('admin/motivation/authors') @UseGuards(AuthGuard)
  listAuthorWatches(@CurrentUser() user: AccessTokenPayload) { return this.service.listAuthorWatches(user.role); }
  @Post('admin/motivation/authors') @UseGuards(AuthGuard)
  addAuthorWatch(@CurrentUser() user: AccessTokenPayload, @Body() input: MotivationAuthorWatchInput) { return this.service.addAuthorWatch(user.role, user.sub, input); }
  @Delete('admin/motivation/authors/:id') @UseGuards(AuthGuard)
  deleteAuthorWatch(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.deleteAuthorWatch(user.role, id); }
  @Post('admin/motivation/authors/:id/search') @UseGuards(AuthGuard)
  searchAuthorWatch(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.searchAuthorWatch(user.role, id); }

  @Get('admin/motivation/sources') @UseGuards(AuthGuard)
  listSourceWatches(@CurrentUser() user: AccessTokenPayload) { return this.service.listSourceWatches(user.role); }
  @Post('admin/motivation/sources') @UseGuards(AuthGuard)
  addSourceWatch(@CurrentUser() user: AccessTokenPayload, @Body() input: MotivationSourceWatchInput) { return this.service.addSourceWatch(user.role, user.sub, input); }
  @Delete('admin/motivation/sources/:id') @UseGuards(AuthGuard)
  deleteSourceWatch(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.deleteSourceWatch(user.role, id); }
  @Post('admin/motivation/sources/:id/search') @UseGuards(AuthGuard)
  searchSourceWatch(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.searchSourceWatch(user.role, id); }
}
