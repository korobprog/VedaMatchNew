import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  AdminUpdateSubscriptionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Публичный тариф для лендинга. */
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
