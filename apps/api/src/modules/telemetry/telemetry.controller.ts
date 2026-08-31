import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  InstallEnvironmentSummary,
} from '@vedamatch/shared';
import { isPortalAdmin } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { parseInstallEnvironmentReport } from './install-environment-dto';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /** Замер шлёт браузер один раз за сессию — см. install-environment-beacon. */
  @UseGuards(AuthGuard)
  @Post('install-environment')
  async record(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const report = parseInstallEnvironmentReport(body);
    if (!report) throw new BadRequestException('Неизвестное окружение');
    await this.telemetry.recordInstallEnvironment(user.sub, report);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('install-environment')
  summary(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<InstallEnvironmentSummary> {
    if (!isPortalAdmin(user))
      throw new ForbiddenException('Только администратор');
    return this.telemetry.installEnvironmentSummary();
  }
}
