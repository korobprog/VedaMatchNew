import type { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from './access.service';

function prismaMock() {
  return {
    activityFollow: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const service = (p: ReturnType<typeof prismaMock>) =>
  new PortalAccessService(p as unknown as PrismaService);

describe('PortalAccessService.canSeeActivity', () => {
  it('открытый доступ виден', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findFirst.mockResolvedValue({ granterId: 'owner' });

    expect(await service(prisma).canSeeActivity('viewer', 'owner')).toBe(true);
  });

  it('без записи в графе — не виден', async () => {
    expect(await service(prismaMock()).canSeeActivity('viewer', 'owner')).toBe(
      false,
    );
  });

  /**
   * Иначе человек не увидит собственный плейлист «для друзей», и это выглядит
   * как потеря данных.
   */
  it('себе видно всегда, даже без записи в графе', async () => {
    const prisma = prismaMock();

    expect(await service(prisma).canSeeActivity('u1', 'u1')).toBe(true);
    expect(prisma.activityFollow.findFirst).not.toHaveBeenCalled();
  });

  // Доступ односторонний: «я открыл тебе» не значит «ты открыл мне».
  it('спрашивает про владельца как дающего, а не наоборот', async () => {
    const prisma = prismaMock();

    await service(prisma).canSeeActivity('viewer', 'owner');

    expect(prisma.activityFollow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { granterId: 'owner', granteeId: 'viewer', revokedAt: null },
      }),
    );
  });

  // Отозванный доступ — это отсутствие доступа, а не запись в графе.
  it('отозванные записи не считает', async () => {
    const prisma = prismaMock();

    await service(prisma).canSeeActivity('viewer', 'owner');

    expect(prisma.activityFollow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });
});

describe('PortalAccessService — списки', () => {
  it('кому открыл — с источником доступа', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findMany.mockResolvedValue([
      { granteeId: 'a', source: 'union' },
      { granteeId: 'b', source: 'contacts' },
    ]);

    expect(await service(prisma).granteesOf('owner')).toEqual([
      { granteeId: 'a', source: 'union' },
      { granteeId: 'b', source: 'contacts' },
    ]);
  });

  it('кто открыл мне — тоже с источником', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findMany.mockResolvedValue([
      { granterId: 'a', source: 'union' },
    ]);

    expect(await service(prisma).grantersFor('viewer')).toEqual([
      { granterId: 'a', source: 'union' },
    ]);
  });

  it('пустой граф — пустой список, а не отказ', async () => {
    expect(await service(prismaMock()).granteesOf('owner')).toEqual([]);
    expect(await service(prismaMock()).grantersFor('viewer')).toEqual([]);
  });
});
