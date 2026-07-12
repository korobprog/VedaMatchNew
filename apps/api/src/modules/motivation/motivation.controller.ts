import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload, MotivationAdminUpdate, MotivationLanguage, MotivationPreferenceUpdate } from '@vedamatch/shared';
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
  regenerate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.regenerate(user.role, id); }
  @Post('admin/motivation/generate') @UseGuards(AuthGuard)
  generate(@CurrentUser() user: AccessTokenPayload, @Body() input: { date?: string }) { return this.service.enqueueDaily(user.role, input.date); }
}
