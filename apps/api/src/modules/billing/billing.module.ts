import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminBillingController,
  AdminDonationController,
  AdminPlatformSettingsController,
  BillingController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { DonationAvatarService } from './donation-avatar.service';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [
    BillingController,
    AdminBillingController,
    AdminDonationController,
    AdminPlatformSettingsController,
  ],
  providers: [BillingService, PlatformSettingsService, DonationAvatarService],
  exports: [BillingService],
})
export class BillingModule {}
