import {
  Body,
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
  BroadcastAnnouncementRequest,
  CreateAnnouncementRequest,
  CreateReleaseRequest,
  CreateRoadmapItemRequest,
  UpdateAnnouncementRequest,
  UpdateReleaseRequest,
  UpdateRoadmapItemRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ChangelogService, type Lang } from './changelog.service';

function resolveLang(value?: string): Lang {
  return value === 'en' ? 'en' : 'ru';
}

@Controller('changelog')
export class ChangelogController {
  constructor(private readonly changelog: ChangelogService) {}

  @Get('releases')
  releases(@Query('lang') lang?: string) {
    return this.changelog.listReleases(resolveLang(lang));
  }

  @Get('releases/current')
  currentRelease(@Query('lang') lang?: string) {
    return this.changelog.getCurrentRelease(resolveLang(lang));
  }

  /** Новость для баннера на главной: одна актуальная или ничего. */
  @Get('announcements/home')
  homeAnnouncement(@Query('lang') lang?: string) {
    return this.changelog.homeAnnouncement(resolveLang(lang));
  }

  @Get('announcements')
  announcements(@Query('lang') lang?: string) {
    return this.changelog.listAnnouncements(resolveLang(lang));
  }

  @Get('roadmap')
  roadmap(@Query('lang') lang?: string) {
    return this.changelog.listRoadmap(resolveLang(lang));
  }
}

@Controller('admin/changelog')
@UseGuards(AuthGuard)
export class AdminChangelogController {
  constructor(private readonly changelog: ChangelogService) {}

  @Get('releases')
  listReleases(@CurrentUser() user: AccessTokenPayload) {
    return this.changelog.adminListReleases(user.role);
  }

  @Post('releases')
  createRelease(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateReleaseRequest,
  ) {
    return this.changelog.adminCreateRelease(user.role, body);
  }

  @Patch('releases/:id')
  updateRelease(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateReleaseRequest,
  ) {
    return this.changelog.adminUpdateRelease(user.role, id, body);
  }

  @Patch('releases/:id/current')
  setCurrentRelease(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.changelog.adminSetCurrentRelease(user.role, id);
  }

  @Delete('releases/:id')
  deleteRelease(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.changelog.adminDeleteRelease(user.role, id);
  }

  @Get('announcements')
  listAnnouncements(@CurrentUser() user: AccessTokenPayload) {
    return this.changelog.adminListAnnouncements(user.role);
  }

  @Post('announcements')
  createAnnouncement(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateAnnouncementRequest,
  ) {
    return this.changelog.adminCreateAnnouncement(user.role, body);
  }

  @Patch('announcements/:id')
  updateAnnouncement(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateAnnouncementRequest,
  ) {
    return this.changelog.adminUpdateAnnouncement(user.role, id, body);
  }

  /** Рассылка новости: отдельным действием после публикации. */
  @Post('announcements/:id/broadcast')
  broadcastAnnouncement(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: BroadcastAnnouncementRequest = {},
  ) {
    return this.changelog.adminBroadcastAnnouncement(user.role, id, body);
  }

  @Delete('announcements/:id')
  deleteAnnouncement(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.changelog.adminDeleteAnnouncement(user.role, id);
  }

  @Get('roadmap')
  listRoadmap(@CurrentUser() user: AccessTokenPayload) {
    return this.changelog.adminListRoadmap(user.role);
  }

  @Post('roadmap')
  createRoadmapItem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateRoadmapItemRequest,
  ) {
    return this.changelog.adminCreateRoadmapItem(user.role, body);
  }

  @Patch('roadmap/:id')
  updateRoadmapItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateRoadmapItemRequest,
  ) {
    return this.changelog.adminUpdateRoadmapItem(user.role, id, body);
  }

  @Delete('roadmap/:id')
  deleteRoadmapItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.changelog.adminDeleteRoadmapItem(user.role, id);
  }
}
