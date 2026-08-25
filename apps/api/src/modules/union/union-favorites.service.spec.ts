import { BadRequestException } from '@nestjs/common';
import { UnionFavoritesService } from './union-favorites.service';

function prismaStub() {
  return {
    unionFavorite: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function service(prisma: ReturnType<typeof prismaStub>) {
  return new UnionFavoritesService(prisma as never);
}

describe('UnionFavoritesService', () => {
  it('marks idempotently: a second tap must not blow up on the unique index', async () => {
    const prisma = prismaStub();

    await service(prisma).add('me', 'them');

    expect(prisma.unionFavorite.upsert).toHaveBeenCalledWith({
      where: { ownerId_favoriteUserId: { ownerId: 'me', favoriteUserId: 'them' } },
      create: { ownerId: 'me', favoriteUserId: 'them' },
      update: {},
    });
  });

  it('refuses to favourite yourself', async () => {
    await expect(service(prismaStub()).add('me', 'me')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('removes by pair, not by row id', async () => {
    const prisma = prismaStub();

    await service(prisma).remove('me', 'them');

    expect(prisma.unionFavorite.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'me', favoriteUserId: 'them' },
    });
  });

  // Отметка приватная: наружу уходят только id, никаких данных об отмеченных
  // людях. Карточки в разделе «Лайки» и так уже загружены.
  it('returns plain ids and nothing about the people', async () => {
    const prisma = prismaStub();
    prisma.unionFavorite.findMany.mockResolvedValue([
      { favoriteUserId: 'a' },
      { favoriteUserId: 'b' },
    ]);

    const result = await service(prisma).list('me');

    expect(result).toEqual({ userIds: ['a', 'b'] });
    expect(prisma.unionFavorite.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'me' },
      orderBy: { createdAt: 'desc' },
      select: { favoriteUserId: true },
    });
  });
});
