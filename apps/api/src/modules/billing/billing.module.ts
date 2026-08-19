import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminBillingController,
  AdminBillingModeController,
  AdminDonationController,
  BillingController,
} from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule],
  controllers: [
    BillingController,
    AdminBillingController,
    AdminBillingModeController,
    AdminDonationController,
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
