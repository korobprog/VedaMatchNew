import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  // AuthGuard тянет JwtSignService — без импорта AuthModule Nest не поднимается.
  imports: [AuthModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
