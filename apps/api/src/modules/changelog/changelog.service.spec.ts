/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangelogService } from './changelog.service';

describe('ChangelogService', () => {
  const prisma = {
    release: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    releaseChange: {
      deleteMany: jest.fn(),
    },
    announcement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    roadmapItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new ChangelogService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('admin role guard', () => {
    it('rejects release creation for a non-admin', async () => {
      await expect(
        service.adminCreateRelease('user', {
          version: '1.0.0',
          releasedAt: '2026-01-01',
          changes: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.release.create).not.toHaveBeenCalled();
    });

    it('rejects roadmap listing for a non-admin', async () => {
      await expect(service.adminListRoadmap('user')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('adminCreateRelease', () => {
    it('creates a release with ordered changes for an admin', async () => {
      prisma.release.create.mockResolvedValue({
        id: 'r1',
        version: '1.4.0',
        isCurrent: false,
        releasedAt: new Date('2026-08-01'),
        changes: [
          {
            id: 'c1',
            type: 'feature',
            titleRu: 'Новая страница версий',
            titleEn: 'New updates page',
            sortOrder: 0,
          },
        ],
      });

      const result = await service.adminCreateRelease('admin', {
        version: '1.4.0',
        releasedAt: '2026-08-01',
        changes: [
          {
            type: 'feature',
            titleRu: 'Новая страница версий',
            titleEn: 'New updates page',
          },
        ],
      });

      expect(result.version).toBe('1.4.0');
      expect(result.changes).toHaveLength(1);
      expect(prisma.release.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: '1.4.0' }),
        }),
      );
    });
  });

  describe('adminSetCurrentRelease', () => {
    it('throws when the release does not exist', async () => {
      prisma.release.findUnique.mockResolvedValue(null);

      await expect(
        service.adminSetCurrentRelease('admin', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('unsets the previous current release and sets the new one in a transaction', async () => {
      prisma.release.findUnique.mockResolvedValue({ id: 'r2' });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await service.adminSetCurrentRelease('admin', 'r2');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [transactionArg] = prisma.$transaction.mock.calls[0] as [unknown[]];
      expect(transactionArg).toHaveLength(2);
    });
  });

  describe('listReleases', () => {
    it('localizes change titles to the requested language', async () => {
      prisma.release.findMany.mockResolvedValue([
        {
          id: 'r1',
          version: '1.0.0',
          isCurrent: true,
          releasedAt: new Date('2026-01-01'),
          changes: [
            {
              id: 'c1',
              type: 'improvement',
              titleRu: 'Улучшение',
              titleEn: 'Improvement',
              sortOrder: 0,
            },
          ],
        },
      ]);

      const [ru, en] = await Promise.all([
        service.listReleases('ru'),
        service.listReleases('en'),
      ]);

      expect(ru[0].changes[0].title).toBe('Улучшение');
      expect(en[0].changes[0].title).toBe('Improvement');
    });
  });
});
