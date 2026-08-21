import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';

// AuthGuard тянет за собой jose (ESM), который jest не разбирает.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { AdminStatsController, StatsController } from './stats.controller';
import type { AdminStatsService } from './admin-stats.service';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  it('делегирует запрос в StatsService.communityStats', async () => {
    const stats = {
      communityStats: jest.fn().mockResolvedValue({ totalMembers: 7 }),
    };
    const controller = new StatsController(stats as unknown as StatsService);

    const result = await controller.community();

    expect(result).toEqual({ totalMembers: 7 });
    expect(stats.communityStats).toHaveBeenCalledTimes(1);
  });
});

describe('AdminStatsController', () => {
  const portalStats = { users: { total: 3 }, queues: [] };

  function build() {
    const stats = { portalStats: jest.fn().mockResolvedValue(portalStats) };
    return {
      stats,
      controller: new AdminStatsController(
        stats as unknown as AdminStatsService,
      ),
    };
  }

  it('отдаёт сводку роли admin', async () => {
    const { controller, stats } = build();

    await expect(
      controller.portal({ role: 'admin' } as AccessTokenPayload),
    ).resolves.toEqual(portalStats);
    expect(stats.portalStats).toHaveBeenCalledTimes(1);
  });

  it('закрыт для администратора сервиса: сводка портальная', () => {
    const { controller, stats } = build();

    expect(() =>
      controller.portal({
        role: 'service-admin',
        adminServices: ['market'],
      } as AccessTokenPayload),
    ).toThrow(ForbiddenException);
    expect(stats.portalStats).not.toHaveBeenCalled();
  });
});
