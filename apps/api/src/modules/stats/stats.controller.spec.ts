import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  it('делегирует запрос в StatsService.communityStats', async () => {
    const stats = {
      communityStats: jest.fn().mockResolvedValue({ totalMembers: 7 }),
    };
    const controller = new StatsController(
      stats as unknown as StatsService,
    );

    const result = await controller.community();

    expect(result).toEqual({ totalMembers: 7 });
    expect(stats.communityStats).toHaveBeenCalledTimes(1);
  });
});
