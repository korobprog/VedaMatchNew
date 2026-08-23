import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminRewardsController,
  RewardsController,
} from './rewards.controller';
import { RewardsAccountsService } from './rewards-accounts.service';
import { RewardsAdminService } from './rewards-admin.service';
import { RewardsLedgerService } from './rewards-ledger.service';
import { RewardsListener } from './rewards.listener';
import { RewardsReferralsService } from './rewards-referrals.service';
import { RewardsService } from './rewards.service';
import { RewardsSettingsService } from './rewards-settings.service';
import { RewardsSpendService } from './rewards-spend.service';
import { RewardsWorkerService } from './rewards-worker.service';

/**
 * Сервис «Баллы и рефералы». По контракту сервисного модуля импортирует
 * только AuthModule; PrismaService глобальный, EventEmitter2 инжектится
 * напрямую. Режим биллинга читается хелпером `readBillingMode`, а не через
 * BillingModule — импорт чужого фичевого модуля запрещён.
 */
@Module({
  imports: [AuthModule],
  controllers: [RewardsController, AdminRewardsController],
  providers: [
    RewardsService,
    RewardsAccountsService,
    RewardsLedgerService,
    RewardsSettingsService,
    RewardsReferralsService,
    RewardsSpendService,
    RewardsAdminService,
    RewardsListener,
    RewardsWorkerService,
  ],
})
export class RewardsModule {}
