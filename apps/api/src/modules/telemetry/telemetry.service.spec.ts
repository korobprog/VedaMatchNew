import { PrismaService } from '../../prisma/prisma.service';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  const prisma = {
    telemetryInstallEnvironment: { upsert: jest.fn(), groupBy: jest.fn() },
  };
  let service: TelemetryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelemetryService(prisma as unknown as PrismaService);
  });

  it('переписывает замер того же человека, а не копит историю', async () => {
    await service.recordInstallEnvironment('user-1', {
      browser: 'yandex-browser',
      platform: 'android',
      displayMode: 'minimal-ui',
      standaloneCapable: false,
    });

    const stored = {
      browser: 'yandex_browser',
      platform: 'android',
      displayMode: 'minimal_ui',
      standaloneCapable: false,
    };
    expect(prisma.telemetryInstallEnvironment.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', ...stored },
      update: stored,
    });
  });

  it('возвращает подчёркивания из базы обратно в дефисы', async () => {
    prisma.telemetryInstallEnvironment.groupBy.mockResolvedValue([
      {
        browser: 'yandex_browser',
        platform: 'android',
        displayMode: 'minimal_ui',
        standaloneCapable: false,
        _count: { _all: 7 },
      },
    ]);

    const summary = await service.installEnvironmentSummary();

    expect(summary.rows).toEqual([
      {
        browser: 'yandex-browser',
        platform: 'android',
        displayMode: 'minimal-ui',
        standaloneCapable: false,
        users: 7,
      },
    ]);
    expect(summary.deadEnd).toBe(7);
  });
});
