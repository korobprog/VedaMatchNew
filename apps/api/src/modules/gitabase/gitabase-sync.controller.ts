import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  GitabaseSyncPushRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { GitabaseSyncService } from './gitabase-sync.service';

@Controller('vedabase/sync')
@UseGuards(AuthGuard)
export class GitabaseSyncController {
  constructor(private readonly sync: GitabaseSyncService) {}

  @Post('push')
  push(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: GitabaseSyncPushRequest,
  ) {
    return this.sync.push(user.sub, body);
  }

  @Get('pull')
  pull(
    @CurrentUser() user: AccessTokenPayload,
    @Query('after') after?: string,
  ) {
    return this.sync.pull(user.sub, after);
  }
}
