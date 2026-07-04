import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  DevoteeVerificationStatus,
  MentorVerificationSubmit,
  PortalUseStageRequest,
  SelfIdentificationAnswers,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { SelfIdentificationService } from './self-identification.service';

@Controller()
export class SelfIdentificationController {
  constructor(private readonly service: SelfIdentificationService) {}

  @Get('self-identification/me')
  @UseGuards(AuthGuard)
  state(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getState(user.sub);
  }

  @Post('self-identification/submit')
  @UseGuards(AuthGuard)
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Body() answers: SelfIdentificationAnswers,
  ) {
    return this.service.submit(user.sub, answers);
  }

  @Post('self-identification/use-stage')
  @UseGuards(AuthGuard)
  useStage(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: PortalUseStageRequest,
  ) {
    return this.service.usePortalStage(user.sub, body.stage);
  }

  @Get('self-identification/history')
  @UseGuards(AuthGuard)
  history(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getHistory(user.sub);
  }

  @Get('mentor-verifications/:token')
  mentorRequest(@Param('token') token: string) {
    return this.service.getMentorPublicRequest(token);
  }

  @Post('mentor-verifications/:token')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  submitMentorForm(
    @Param('token') token: string,
    @Body() body: MentorVerificationSubmit,
  ) {
    return this.service.submitMentorForm(token, body);
  }

  @Get('admin/verification-requests')
  @UseGuards(AuthGuard)
  adminRequests(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: DevoteeVerificationStatus,
  ) {
    if (user.role !== 'admin' && user.role !== 'service-admin') {
      return [];
    }
    return this.service.listAdminRequests(status);
  }

  @Patch('admin/verification-requests/:id')
  @UseGuards(AuthGuard)
  reviewAdminRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { status: DevoteeVerificationStatus; adminNote?: string },
  ) {
    return this.service.reviewAdminRequest(user.role, id, body);
  }
}
