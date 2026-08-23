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
import type {
  AccessTokenPayload,
  AdminRewardsLedgerQuery,
  AdminRewardsRevokeRequest,
  AdminUpdateRewardsSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { assertRewardsAdmin } from './is-admin';
import { RewardsAdminService } from './rewards-admin.service';
import { RewardsService } from './rewards.service';

/**
 * Экран баллов. Эндпоинтов резерва и списания здесь нет намеренно: в бете
 * тратить некуда, а платёжный контур — отдельная задача. Интерфейс списания
 * живёт в RewardsSpendService и наружу не выставлен.
 */
@Controller('rewards')
@UseGuards(AuthGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.rewards.me(user.sub);
  }

  @Get('me/referrals')
  referrals(@CurrentUser() user: AccessTokenPayload) {
    return this.rewards.referrals(user.sub);
  }

  @Get('me/ledger')
  ledger(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page') page?: string,
  ) {
    return this.rewards.ledgerPage(user.sub, Number(page ?? 1));
  }
}

@Controller('admin/rewards')
@UseGuards(AuthGuard)
export class AdminRewardsController {
  constructor(private readonly admin: RewardsAdminService) {}

  @Get('summary')
  summary(@CurrentUser() user: AccessTokenPayload) {
    assertRewardsAdmin(user);
    return this.admin.summary();
  }

  @Get('ledger')
  ledger(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, string>,
  ) {
    assertRewardsAdmin(user);
    const parsed: AdminRewardsLedgerQuery = {
      userId: query.userId || undefined,
      type: (query.type as AdminRewardsLedgerQuery['type']) || undefined,
      since: query.since || undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    };
    return this.admin.ledger(parsed);
  }

  @Post('ledger/:id/revoke')
  revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminRewardsRevokeRequest,
  ) {
    assertRewardsAdmin(user);
    return this.admin.revoke(user.sub, id, body?.reason ?? '');
  }

  @Get('fraud')
  fraud(
    @CurrentUser() user: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    assertRewardsAdmin(user);
    return this.admin.fraud(Number(page ?? 1), Number(pageSize ?? 25));
  }

  @Get('settings')
  settings(@CurrentUser() user: AccessTokenPayload) {
    assertRewardsAdmin(user);
    return this.admin.settingsDto();
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: AdminUpdateRewardsSettingsRequest,
  ) {
    assertRewardsAdmin(user);
    return this.admin.updateSettings(user.sub, body ?? {});
  }
}
