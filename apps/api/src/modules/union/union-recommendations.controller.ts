import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionProfileService } from './union-profile.service';

@Controller('union')
@UseGuards(AuthGuard)
export class UnionRecommendationsController {
  constructor(private readonly profiles: UnionProfileService) {}

  @Get('recommendations')
  recommendations(@CurrentUser() user: AccessTokenPayload) {
    return this.profiles.getRecommendations(user.sub);
  }

  @Get('users/:id')
  userCard(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.profiles.getRecommendationForUser(user.sub, id);
  }
}
