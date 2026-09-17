import {
  SELF_DELETE_GRACE_DAYS,
  deletionEligibleAt,
  finalizeExpiredSelfDeletions,
  pendingSelfDeleteWhere,
  resolveAccountStatus,
} from './account-status';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-18T12:00:00Z');

describe('resolveAccountStatus', () => {
  it('активный без запроса на удаление остаётся активным', () => {
    expect(
      resolveAccountStatus(
        {
          accountStatus: 'active',
          blockedUntil: null,
          pendingDeletionAt: null,
        },
        now,
      ),
    ).toBe('active');
  });

  it('запрос на удаление внутри окна отмены — всё ещё активен', () => {
    const pendingDeletionAt = new Date(
      now.getTime() - (SELF_DELETE_GRACE_DAYS - 1) * DAY_MS,
    );
    expect(
      resolveAccountStatus(
        { accountStatus: 'active', blockedUntil: null, pendingDeletionAt },
        now,
      ),
    ).toBe('active');
  });

  it('окно отмены истекло — удалён', () => {
    const pendingDeletionAt = new Date(
      now.getTime() - (SELF_DELETE_GRACE_DAYS + 1) * DAY_MS,
    );
    expect(
      resolveAccountStatus(
        { accountStatus: 'active', blockedUntil: null, pendingDeletionAt },
        now,
      ),
    ).toBe('deleted');
  });

  it('deletionEligibleAt = запрос + окно отмены', () => {
    const requested = new Date('2026-09-01T00:00:00Z');
    expect(deletionEligibleAt(requested).toISOString()).toBe(
      new Date(
        requested.getTime() + SELF_DELETE_GRACE_DAYS * DAY_MS,
      ).toISOString(),
    );
  });
});

describe('pendingSelfDeleteWhere', () => {
  it('ищет активные аккаунты с истёкшим окном отмены', () => {
    expect(pendingSelfDeleteWhere(now)).toEqual({
      accountStatus: 'active',
      pendingDeletionAt: {
        not: null,
        lte: new Date(now.getTime() - SELF_DELETE_GRACE_DAYS * DAY_MS),
      },
    });
  });
});

function makePrisma(users: Array<Record<string, unknown>>) {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue(users),
      update: jest.fn((args: unknown) => ({ op: 'user.update', args })),
    },
    refreshToken: {
      updateMany: jest.fn((args: unknown) => ({
        op: 'refresh.updateMany',
        args,
      })),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

describe('finalizeExpiredSelfDeletions', () => {
  it('никого не находит — ничего не пишет', async () => {
    const prisma = makePrisma([]);
    await expect(
      finalizeExpiredSelfDeletions(prisma as never, now),
    ).resolves.toBe(0);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: pendingSelfDeleteWhere(now),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('переводит просроченный запрос в deleted и отзывает токены', async () => {
    const expired = new Date(
      now.getTime() - (SELF_DELETE_GRACE_DAYS + 1) * DAY_MS,
    );
    const prisma = makePrisma([
      {
        id: 'u1',
        accountStatus: 'active',
        blockedUntil: null,
        pendingDeletionAt: expired,
      },
    ]);

    await expect(
      finalizeExpiredSelfDeletions(prisma as never, now),
    ).resolves.toBe(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{
      op: string;
      args: unknown;
    }>;
    expect(ops.map((o) => o.op)).toEqual(['refresh.updateMany', 'user.update']);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        accountStatus: 'deleted',
        deletedAt: now,
        statusActor: 'system',
        statusChangedAt: now,
      },
    });
  });

  it('запрос ещё внутри окна отмены — не трогает аккаунт', async () => {
    const stillPending = new Date(
      now.getTime() - (SELF_DELETE_GRACE_DAYS - 1) * DAY_MS,
    );
    const prisma = makePrisma([
      {
        id: 'u2',
        accountStatus: 'active',
        blockedUntil: null,
        pendingDeletionAt: stillPending,
      },
    ]);

    await expect(
      finalizeExpiredSelfDeletions(prisma as never, now),
    ).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
