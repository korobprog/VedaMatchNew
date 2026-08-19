import { ForbiddenException } from '@nestjs/common';
import { MotivationAnalyticsService } from './motivation-analytics.service';

function build() {
  const prisma = {
    motivationView: { count: jest.fn().mockResolvedValue(120) },
    motivationLike: { count: jest.fn().mockResolvedValue(31) },
    motivationFavorite: { count: jest.fn().mockResolvedValue(7) },
    motivationPost: {
      count: jest.fn().mockResolvedValue(4),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { estimatedCostUsd: '1.50', videoCostUsd: '0.25' },
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          slug: 'daily',
          likeCount: 40,
          origin: 'editorial',
          translations: [{ title: 'Пост дня' }],
        },
        {
          id: 'p2',
          slug: 'reel',
          likeCount: 3,
          origin: 'user',
          translations: [],
        },
      ]),
    },
  };
  return { service: new MotivationAnalyticsService(prisma as never), prisma };
}

describe('MotivationAnalyticsService', () => {
  it('sums feed activity, user reels and cost per origin', async () => {
    const { service } = build();

    const result = await service.read('admin', 7);

    expect(result).toMatchObject({
      days: 7,
      views: 120,
      likes: 31,
      favorites: 7,
      // Расход складывается из картинок и видео.
      editorialCostUsd: 1.75,
      userCostUsd: 1.75,
    });
    expect(result.top[0]).toEqual({
      id: 'p1',
      slug: 'daily',
      title: 'Пост дня',
      likeCount: 40,
      origin: 'editorial',
    });
    // Без перевода заголовком становится slug, а не пустая строка.
    expect(result.top[1].title).toBe('reel');
  });

  it('clamps the window and refuses non-admins', async () => {
    const { service, prisma } = build();

    await expect(service.read('admin', 900)).resolves.toMatchObject({
      days: 90,
    });
    await expect(service.read('admin', 0)).resolves.toMatchObject({ days: 1 });
    expect(prisma.motivationView.count).toHaveBeenCalled();
    await expect(service.read('user')).rejects.toThrow(ForbiddenException);
  });
});
