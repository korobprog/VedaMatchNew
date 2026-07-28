/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  const prisma = {
    userBlock: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    userReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    unionConnectionRequest: { updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new ModerationService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'target' });
    prisma.userBlock.findMany.mockResolvedValue([]);
  });

  it('hides both directions of a block', async () => {
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'me', blockedId: 'blocked-by-me' },
      { blockerId: 'blocked-me', blockedId: 'me' },
    ]);

    await expect(service.hiddenUserIds('me')).resolves.toEqual(
      new Set(['blocked-by-me', 'blocked-me']),
    );
  });

  it('cancels pending requests when blocking', async () => {
    await service.block('me', 'target');

    expect(prisma.unionConnectionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending' }),
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );
  });

  it('rejects blocking yourself', async () => {
    await expect(service.block('me', 'me')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['self report', 'me', { reason: 'spam' as const }],
    ['unknown reason', 'target', { reason: 'whatever' as never }],
  ])('rejects %s', async (_label, targetId, body) => {
    await expect(service.report('me', targetId, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.userReport.create).not.toHaveBeenCalled();
  });

  it('stores a valid report with a trimmed comment', async () => {
    await service.report('me', 'target', {
      reason: 'harassment',
      comment: '  оскорбления в чате  ',
    });

    expect(prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: 'me',
        targetId: 'target',
        reason: 'harassment',
        comment: 'оскорбления в чате',
      },
    });
  });

  it.each(['user', 'service-admin'] as const)(
    'denies the admin queue to role %s',
    async (role) => {
      await expect(service.adminList(role)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it('records the reviewing moderator when closing a report', async () => {
    prisma.userReport.findUnique.mockResolvedValue({ id: 'report-1' });

    await service.adminUpdate({ sub: 'admin-1', role: 'admin' }, 'report-1', {
      status: 'reviewed',
      moderatorNote: 'профиль скрыт',
    });

    expect(prisma.userReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-1' },
        data: expect.objectContaining({
          status: 'reviewed',
          reviewedById: 'admin-1',
          moderatorNote: 'профиль скрыт',
        }),
      }),
    );
  });

  it('clears the review trail when a report returns to the queue', async () => {
    prisma.userReport.findUnique.mockResolvedValue({ id: 'report-1' });

    await service.adminUpdate({ sub: 'admin-1', role: 'admin' }, 'report-1', {
      status: 'open',
    });

    expect(prisma.userReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'open',
          reviewedAt: null,
          reviewedById: null,
        }),
      }),
    );
  });
});
