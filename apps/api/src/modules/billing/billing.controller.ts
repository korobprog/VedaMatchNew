import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AdminUpdateBillingModeRequest,
  AdminUpdateSubscriptionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Публичный тариф для лендинга, включает текущий режим биллинга. */
  @Get('plan')
  plan() {
    return this.billing.plan();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.billing.state(user.sub);
  }
}

@Controller('admin/billing/users')
@UseGuards(AuthGuard)
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  @Patch(':id')
  update(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminUpdateSubscriptionRequest,
  ) {
    return this.billing.adminUpdate(admin.role, id, body);
  }
}

@Controller('admin/billing/mode')
@UseGuards(AuthGuard)
export class AdminBillingModeController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async get(@CurrentUser() admin: AccessTokenPayload) {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    return { mode: await this.billing.billingMode() };
  }

  @Patch()
  async update(
    @CurrentUser() admin: AccessTokenPayload,
    @Body() body: AdminUpdateBillingModeRequest,
  ) {
    return { mode: await this.billing.setBillingMode(admin.role, body.mode) };
  }
}
