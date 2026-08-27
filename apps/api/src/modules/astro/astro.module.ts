import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AstroAdminController } from './astro-admin.controller';
import { AstroAdminService } from './astro-admin.service';
import { AstroBirthDataController } from './astro-birth-data.controller';
import { AstroBirthDataService } from './astro-birth-data.service';
import { AstroChartController } from './astro-chart.controller';
import { AstroSubjectsController } from './astro-subjects.controller';
import { AstroSubjectsService } from './astro-subjects.service';
import { AstroChartService } from './astro-chart.service';
import { AstroGenerationService } from './astro-generation.service';
import { AstroQuotaService } from './astro-quota.service';
import { AstroReadingController } from './astro-reading.controller';
import { AstroReadingService } from './astro-reading.service';
import { AstroSettingsService } from './astro-settings.service';
import { AstroCompatibilityController } from './compatibility/astro-compatibility.controller';
import { AstroCompatibilityService } from './compatibility/astro-compatibility.service';
import { AstronomiaEphemerisProvider } from './ephemeris/astronomia-provider';
import { EPHEMERIS_PROVIDER } from './ephemeris/ephemeris.token';
import { AstroTransitController } from './transits/astro-transit.controller';
import { AstroTransitService } from './transits/astro-transit.service';
import { AstroTransitWorkerService } from './transits/astro-transit-worker.service';

@Module({
  // UsersModule — как и в Union, для read-only доступа к профилю (имя, аватар)
  // через UsersService.resolveAvatarUrl; см. union-profile.service.ts.
  imports: [AuthModule, UsersModule],
  controllers: [
    AstroBirthDataController,
    AstroChartController,
    AstroSubjectsController,
    AstroReadingController,
    AstroAdminController,
    AstroCompatibilityController,
    AstroTransitController,
  ],
  providers: [
    AstroSubjectsService,
    AstroAdminService,
    AstroBirthDataService,
    AstroChartService,
    AstroCompatibilityService,
    AstroGenerationService,
    AstroQuotaService,
    AstroReadingService,
    AstroSettingsService,
    AstroTransitService,
    AstroTransitWorkerService,
    { provide: EPHEMERIS_PROVIDER, useClass: AstronomiaEphemerisProvider },
  ],
  exports: [EPHEMERIS_PROVIDER],
})
export class AstroModule {}
