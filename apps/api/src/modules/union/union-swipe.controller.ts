import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload, UnionSwipeRequest } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionSwipeService } from './union-swipe.service';

@Controller('union/swipes')
@UseGuards(AuthGuard)
export class UnionSwipeController {
  constructor(private readonly swipes: UnionSwipeService) {}

  @Post()
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UnionSwipeRequest,
  ) {
    return this.swipes.decide(user.sub, body);
  }

  @Delete('last')
  undoLast(@CurrentUser() user: AccessTokenPayload) {
    return this.swipes.undoLast(user.sub);
  }

  @Delete('history')
  resetHistory(@CurrentUser() user: AccessTokenPayload) {
    return this.swipes.resetHistory(user.sub);
  }

  /** Новый круг: снимает пропуски, но не лайки и не архив. */
  @Post('new-cycle')
  startNewCycle(@CurrentUser() user: AccessTokenPayload) {
    return this.swipes.startNewCycle(user.sub);
  }
}
