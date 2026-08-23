import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibrarySectionRequestBody,
  DecideLibrarySectionRequestBody,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibrarySectionRequestsService } from './library-section-requests.service';
import { isAdmin } from './is-admin';

@Controller('library')
@UseGuards(AuthGuard)
export class LibrarySectionRequestsController {
  constructor(private readonly requests: LibrarySectionRequestsService) {}

  /** Заявка на новый раздел. Лимит: это просьба к людям, а не форма ввода. */
  @Post('section-requests')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibrarySectionRequestBody,
  ) {
    return this.requests.create(user.sub, body);
  }

  @Get('section-requests/mine')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.requests.listMine(user.sub);
  }

  @Get('admin/section-requests')
  listForAdmin(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.requests.listForAdmin(isAdmin(user), status);
  }

  @Post('admin/section-requests/:id/decide')
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: DecideLibrarySectionRequestBody,
  ) {
    return this.requests.decide(user.sub, isAdmin(user), id, body);
  }
}
