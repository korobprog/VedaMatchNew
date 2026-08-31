import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationAnalyticsService } from './motivation-analytics.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

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

    const result = await service.read(admin, 7);

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

    await expect(service.read(admin, 900)).resolves.toMatchObject({
      days: 90,
    });
    await expect(service.read(admin, 0)).resolves.toMatchObject({ days: 1 });
    expect(prisma.motivationView.count).toHaveBeenCalled();
    await expect(service.read(regularUser)).rejects.toThrow(ForbiddenException);
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service } = build();

    await expect(
      service.read(motivationServiceAdmin, 7),
    ).resolves.toMatchObject({ days: 7 });
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service } = build();

    await expect(service.read(otherServiceAdmin, 7)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
