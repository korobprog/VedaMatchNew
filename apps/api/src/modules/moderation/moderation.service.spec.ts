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
    userHiddenFrom: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    unionConnectionRequest: { updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const events = { emit: jest.fn() };
  const service = new ModerationService(
    prisma as unknown as PrismaService,
    events as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'target' });
    prisma.userBlock.findMany.mockResolvedValue([]);
    prisma.userBlock.findFirst.mockResolvedValue(null);
    prisma.userHiddenFrom.findMany.mockResolvedValue([]);
    prisma.userHiddenFrom.findFirst.mockResolvedValue(null);
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

  it('adds one-way hides to the blocked set', async () => {
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'me', blockedId: 'blocked-by-me' },
    ]);
    prisma.userHiddenFrom.findMany.mockResolvedValue([
      { ownerId: 'declined-me' },
    ]);

    await expect(service.hiddenUserIds('me', 'contacts')).resolves.toEqual(
      new Set(['blocked-by-me', 'declined-me']),
    );
  });

  it('asks a service scope for its own records and the global ones', async () => {
    await service.hiddenUserIds('me', 'contacts');

    expect(prisma.userHiddenFrom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          viewerId: 'me',
          scope: { in: ['all', 'contacts'] },
        }),
      }),
    );
  });

  it('does not apply a service-scoped hide to the global scope', async () => {
    await service.hiddenUserIds('me');

    expect(prisma.userHiddenFrom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: { in: ['all'] } }),
      }),
    );
  });

  it('ignores hides whose term has run out', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    await service.hiddenUserIds('me');

    expect(prisma.userHiddenFrom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date('2026-08-13T10:00:00.000Z') } },
          ],
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('treats a one-way hide as hidden even without a block', async () => {
    prisma.userHiddenFrom.findFirst.mockResolvedValue({ id: 'hide-1' });

    await expect(service.isHidden('me', 'other')).resolves.toBe(true);
  });

  it('hides the target from the viewer, not the other way round', async () => {
    prisma.userHiddenFrom.findMany.mockResolvedValue([]);

    await service.hide('me', 'target');

    expect(prisma.userHiddenFrom.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          ownerId: 'target',
          viewerId: 'me',
          scope: 'all',
          source: 'manual',
          expiresAt: null,
        },
      }),
    );
  });

  it('rejects hiding yourself', async () => {
    await expect(service.hide('me', 'me')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.userHiddenFrom.upsert).not.toHaveBeenCalled();
  });

  it('lists only the hides a person made by hand', async () => {
    prisma.userHiddenFrom.findMany.mockResolvedValue([]);

    await service.listHidden('me');

    expect(prisma.userHiddenFrom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { viewerId: 'me', source: 'manual' } }),
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
