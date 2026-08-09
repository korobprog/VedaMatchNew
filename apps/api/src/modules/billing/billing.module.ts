import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminBillingController,
  AdminBillingModeController,
  BillingController,
} from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule],
  controllers: [
    BillingController,
    AdminBillingController,
    AdminBillingModeController,
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
