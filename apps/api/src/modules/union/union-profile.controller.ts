import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  UnionGenerateTextRequest,
  UnionProfileUpdateRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionProfileService } from './union-profile.service';

@Controller('union/profile')
@UseGuards(AuthGuard)
export class UnionProfileController {
  constructor(private readonly profiles: UnionProfileService) {}

  @Get()
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.profiles.getState(user.sub);
  }

  @Put()
  upsert(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UnionProfileUpdateRequest,
  ) {
    return this.profiles.upsertProfile(user.sub, body);
  }

  @Post('generate')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UnionGenerateTextRequest,
  ) {
    return this.profiles.generateText(user.sub, body.field);
  }
}
