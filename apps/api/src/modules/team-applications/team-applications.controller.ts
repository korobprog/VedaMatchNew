import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AdminUpdateTeamApplicationRequest,
  CreateTeamApplicationRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { TeamApplicationsService } from './team-applications.service';

/** Публичная часть: заявку можно отправить без авторизации. */
@Controller('team/applications')
export class TeamApplicationsController {
  constructor(private readonly team: TeamApplicationsService) {}

  // Форма открыта всему интернету: держим жёсткий лимит на создание.
  @Post()
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Body() body: CreateTeamApplicationRequest,
  ) {
    return this.team.create(body, user ? { sub: user.sub } : undefined);
  }
}

@Controller('admin/team/applications')
@UseGuards(AuthGuard)
export class AdminTeamApplicationsController {
  constructor(private readonly team: TeamApplicationsService) {}

  @Get()
  list(
    @CurrentUser() admin: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.team.adminList(admin.role, status);
  }

  @Get(':id')
  get(@CurrentUser() admin: AccessTokenPayload, @Param('id') id: string) {
    return this.team.adminGet(admin.role, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminUpdateTeamApplicationRequest,
  ) {
    return this.team.adminUpdate(admin.role, id, body);
  }
}
