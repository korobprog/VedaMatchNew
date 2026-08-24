import { Controller, Get, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  ActivityFeedResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ActivityFeedService } from './activity-feed.service';

@Controller('activity')
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(private readonly feed: ActivityFeedService) {}

  @Get('feed')
  getFeed(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ActivityFeedResponse> {
    return this.feed.getFeed(user.sub);
  }
}
