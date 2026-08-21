import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController, StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [AuthModule],
  controllers: [StatsController, AdminStatsController],
  providers: [StatsService, AdminStatsService],
})
export class StatsModule {}
