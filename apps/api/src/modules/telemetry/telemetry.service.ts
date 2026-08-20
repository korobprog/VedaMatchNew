import { Injectable } from '@nestjs/common';
import type {
  TelemetryPwaBrowser,
  TelemetryPwaDisplayMode,
  TelemetryPwaPlatform,
} from '@prisma/client';
import type {
  InstallEnvironmentReport,
  InstallEnvironmentRow,
  InstallEnvironmentSummary,
  PwaBrowserFamily,
  PwaDisplayMode,
  PwaPlatform,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { fromDbValue, toDbValue } from './install-environment-dto';
import { summarizeInstallEnvironments } from './install-environment-summary';

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Одна строка на человека: замер перезаписывается, история не копится. */
  async recordInstallEnvironment(
    userId: string,
    report: InstallEnvironmentReport,
  ): Promise<void> {
    // toDbValue переводит дефис в подчёркивание; список значений уже сужен
    // parseInstallEnvironmentReport, поэтому приведение здесь безопасно.
    const data = {
      browser: toDbValue(report.browser) as TelemetryPwaBrowser,
      platform: toDbValue(report.platform) as TelemetryPwaPlatform,
      displayMode: toDbValue(report.displayMode) as TelemetryPwaDisplayMode,
      standaloneCapable: report.standaloneCapable,
    };

    await this.prisma.telemetryInstallEnvironment.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async installEnvironmentSummary(): Promise<InstallEnvironmentSummary> {
    const grouped = await this.prisma.telemetryInstallEnvironment.groupBy({
      by: ['browser', 'platform', 'displayMode', 'standaloneCapable'],
      _count: { _all: true },
    });

    const rows: InstallEnvironmentRow[] = grouped.map((group) => ({
      browser: fromDbValue(group.browser) as PwaBrowserFamily,
      platform: fromDbValue(group.platform) as PwaPlatform,
      displayMode: fromDbValue(group.displayMode) as PwaDisplayMode,
      standaloneCapable: group.standaloneCapable,
      users: group._count._all,
    }));

    return summarizeInstallEnvironments(rows);
  }
}
