import { BadRequestException } from '@nestjs/common';
import { UnionArchiveService } from './union-archive.service';

function prismaStub() {
  return {
    unionArchive: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function service(prisma: ReturnType<typeof prismaStub>) {
  return new UnionArchiveService(prisma as never);
}

describe('UnionArchiveService', () => {
  it('archives idempotently: a second press must not blow up on the unique index', async () => {
    const prisma = prismaStub();

    await service(prisma).archive('me', 'them');

    expect(prisma.unionArchive.upsert).toHaveBeenCalledWith({
      where: { ownerId_archivedUserId: { ownerId: 'me', archivedUserId: 'them' } },
      create: { ownerId: 'me', archivedUserId: 'them' },
      update: {},
    });
  });

  // Иначе человек прячет сам себя и остаётся без собственной анкеты в выдаче.
  it('refuses to archive yourself', async () => {
    await expect(service(prismaStub()).archive('me', 'me')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('restores by pair, not by row id', async () => {
    const prisma = prismaStub();

    await service(prisma).restore('me', 'them');

    expect(prisma.unionArchive.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'me', archivedUserId: 'them' },
    });
  });

  it('returns archived ids as a set for exclusion', async () => {
    const prisma = prismaStub();
    prisma.unionArchive.findMany.mockResolvedValue([
      { archivedUserId: 'a' },
      { archivedUserId: 'b' },
    ]);

    const ids = await service(prisma).archivedUserIds('me');

    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  // Наружу уходит духовное имя, если оно есть: правило портала про
  // resolveDisplayName действует и здесь.
  it('shows the spiritual name when the person has one', async () => {
    const prisma = prismaStub();
    prisma.unionArchive.findMany.mockResolvedValue([
      {
        archivedUserId: 'a',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        archivedUser: {
          id: 'a',
          name: 'Пётр',
          spiritualName: 'Кешава дас',
          avatarUrl: null,
          city: 'Москва',
          country: 'Россия',
        },
      },
    ]);

    const result = await service(prisma).list('me');

    expect(result.items[0].user.name).toBe('Кешава дас');
    expect(result.items[0].archivedAt).toBe('2026-08-20T10:00:00.000Z');
  });
});
