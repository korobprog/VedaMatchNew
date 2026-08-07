import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionBoostService } from './union-boost.service';

@Controller('union/boost')
@UseGuards(AuthGuard)
export class UnionBoostController {
  constructor(private readonly boosts: UnionBoostService) {}

  @Get('status')
  status(@CurrentUser() user: AccessTokenPayload) {
    return this.boosts.status(user.sub);
  }

  @Post()
  activate(@CurrentUser() user: AccessTokenPayload) {
    return this.boosts.activate(user.sub);
  }
}
