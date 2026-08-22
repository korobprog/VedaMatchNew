import { PrismaService } from '../../prisma/prisma.service';
import { UnionConnectionService } from './union-connection.service';
import { SUPERLIKES_PER_DAY, UNDO_PER_DAY } from './union-limits';
import { UnionSwipeService } from './union-swipe.service';

const now = new Date('2026-08-07T10:00:00.000Z');

function swipe(
  options: {
    id?: string;
    fromUserId?: string;
    toUserId?: string;
    decision?: 'like' | 'superlike' | 'pass';
    undoneAt?: Date | null;
  } = {},
) {
  return {
    id: options.id ?? 'swipe-1',
    fromUserId: options.fromUserId ?? 'user-1',
    toUserId: options.toUserId ?? 'user-2',
    decision: options.decision ?? 'like',
    createdAt: now,
    undoneAt: options.undoneAt ?? null,
  };
}

describe('UnionSwipeService', () => {
  const prisma = {
    unionProfile: { findUnique: jest.fn() },
    unionSwipe: {
      count: jest.fn(() => Promise.resolve(0)),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    unionConnectionRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const connections = { create: jest.fn() };
  const service = new UnionSwipeService(
    prisma as unknown as PrismaService,
    connections as unknown as UnionConnectionService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    prisma.unionProfile.findUnique.mockResolvedValue({
      userId: 'user-2',
      contactMode: 'requests',
    });
    prisma.unionSwipe.count.mockResolvedValue(0);
  });

  afterEach(() => jest.useRealTimers());

  it('rejects a swipe on yourself', async () => {
    await expect(
      service.decide('user-1', { toUserId: 'user-1', decision: 'like' }),
    ).rejects.toThrow('Cannot swipe on yourself');
    expect(prisma.unionSwipe.upsert).not.toHaveBeenCalled();
  });

  it('stores a pass without creating a connection request', async () => {
    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'pass' }),
    ).resolves.toEqual({
      toUserId: 'user-2',
      decision: 'pass',
      matched: false,
      connection: null,
    });
    expect(prisma.unionSwipe.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { fromUserId: 'user-1', toUserId: 'user-2', decision: 'pass' },
      }),
    );
    expect(connections.create).not.toHaveBeenCalled();
  });

  it('reports a match when the connection request comes back accepted', async () => {
    prisma.unionSwipe.findUnique.mockResolvedValue(
      swipe({ fromUserId: 'user-2', toUserId: 'user-1' }),
    );
    prisma.unionConnectionRequest.findUnique.mockResolvedValue({
      id: 'request-1',
    });
    connections.create.mockResolvedValue({
      id: 'request-1',
      status: 'accepted',
    });

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).resolves.toEqual(
      expect.objectContaining({ matched: true, decision: 'like' }),
    );
  });

  it('keeps a one-sided like private when the other person wants mutual only', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue({
      userId: 'user-2',
      contactMode: 'mutual_only',
    });
    prisma.unionSwipe.findUnique.mockResolvedValue(null);

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).resolves.toEqual(
      expect.objectContaining({ matched: false, connection: null }),
    );
    expect(prisma.unionSwipe.upsert).toHaveBeenCalled();
    expect(connections.create).not.toHaveBeenCalled();
  });

  it('creates the missing counter-request so a mutual like opens a chat', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue({
      userId: 'user-2',
      contactMode: 'mutual_only',
    });
    prisma.unionSwipe.findUnique.mockResolvedValue(
      swipe({ fromUserId: 'user-2', toUserId: 'user-1' }),
    );
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(null);
    connections.create
      .mockResolvedValueOnce({ id: 'request-1', status: 'pending' })
      .mockResolvedValueOnce({ id: 'request-1', status: 'accepted' });

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).resolves.toEqual(expect.objectContaining({ matched: true }));
    // Встречная заявка — служебная, без пуша «X прислал заявку».
    expect(connections.create).toHaveBeenNthCalledWith(
      1,
      'user-2',
      { toUserId: 'user-1' },
      { silent: true },
    );
    expect(connections.create).toHaveBeenNthCalledWith(2, 'user-1', {
      toUserId: 'user-2',
      message: null,
      isSuperlike: false,
    });
  });

  it('rolls back a fresh like when the connection request is refused', async () => {
    // Строки свайпа раньше не было — на откате её удаляем целиком.
    prisma.unionSwipe.findUnique.mockResolvedValue(null);
    connections.create.mockRejectedValue(new Error('Отправка недоступна'));

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).rejects.toThrow('Отправка недоступна');
    expect(prisma.unionSwipe.upsert).toHaveBeenCalled();
    expect(prisma.unionSwipe.delete).toHaveBeenCalledWith({
      where: {
        fromUserId_toUserId: { fromUserId: 'user-1', toUserId: 'user-2' },
      },
    });
    expect(prisma.unionSwipe.update).not.toHaveBeenCalled();
  });

  it('restores the previous swipe row when the connection request is refused', async () => {
    const earlier = new Date('2026-08-01T10:00:00.000Z');
    prisma.unionSwipe.findUnique
      // Прежнее состояние строки: откатанный суперлайк.
      .mockResolvedValueOnce(
        swipe({ decision: 'superlike', undoneAt: earlier }),
      )
      // Встречный свайп для likedMe.
      .mockResolvedValueOnce(null);
    prisma.unionSwipe.findUnique.mockResolvedValue(null);
    connections.create.mockRejectedValue(new Error('Отправка недоступна'));

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).rejects.toThrow('Отправка недоступна');
    expect(prisma.unionSwipe.delete).not.toHaveBeenCalled();
    expect(prisma.unionSwipe.update).toHaveBeenCalledWith({
      where: {
        fromUserId_toUserId: { fromUserId: 'user-1', toUserId: 'user-2' },
      },
      data: { decision: 'superlike', createdAt: now, undoneAt: earlier },
    });
  });

  it('keeps a private one-sided like without rolling it back', async () => {
    // Строгий режим у цели — это не ошибка, свайп должен остаться.
    prisma.unionProfile.findUnique.mockResolvedValue({
      userId: 'user-2',
      contactMode: 'mutual_only',
    });
    prisma.unionSwipe.findUnique.mockResolvedValue(null);

    await service.decide('user-1', { toUserId: 'user-2', decision: 'like' });

    expect(prisma.unionSwipe.delete).not.toHaveBeenCalled();
    expect(prisma.unionSwipe.update).not.toHaveBeenCalled();
  });

  it('ignores an undone like of the other person when deciding on a match', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue({
      userId: 'user-2',
      contactMode: 'mutual_only',
    });
    prisma.unionSwipe.findUnique.mockResolvedValue(
      swipe({ fromUserId: 'user-2', toUserId: 'user-1', undoneAt: now }),
    );

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).resolves.toEqual(expect.objectContaining({ connection: null }));
    expect(connections.create).not.toHaveBeenCalled();
  });

  it('marks the connection request as a superlike', async () => {
    prisma.unionSwipe.findUnique.mockResolvedValue(null);
    connections.create.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
    });

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'superlike' }),
    ).resolves.toEqual(expect.objectContaining({ decision: 'superlike' }));
    expect(connections.create).toHaveBeenCalledWith('user-1', {
      toUserId: 'user-2',
      message: null,
      isSuperlike: true,
    });
  });

  it('refuses a superlike once the daily quota is spent', async () => {
    prisma.unionSwipe.count.mockResolvedValue(SUPERLIKES_PER_DAY);

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'superlike' }),
    ).rejects.toThrow('Суперлайки на сегодня закончились');
    expect(prisma.unionSwipe.upsert).not.toHaveBeenCalled();
  });

  it('counts undone superlikes against the quota so undo does not refund it', async () => {
    prisma.unionSwipe.findUnique.mockResolvedValue(null);
    connections.create.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
    });

    await service.decide('user-1', {
      toUserId: 'user-2',
      decision: 'superlike',
    });

    const [{ where }] = prisma.unionSwipe.count.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(where).toEqual({
      fromUserId: 'user-1',
      decision: 'superlike',
      createdAt: { gte: expect.any(Date) as Date },
    });
    expect(where).not.toHaveProperty('undoneAt');
  });

  it('leaves an ordinary like out of the superlike quota', async () => {
    prisma.unionSwipe.count.mockResolvedValue(SUPERLIKES_PER_DAY);
    prisma.unionSwipe.findUnique.mockResolvedValue(null);
    connections.create.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
    });

    await expect(
      service.decide('user-1', { toUserId: 'user-2', decision: 'like' }),
    ).resolves.toEqual(expect.objectContaining({ decision: 'like' }));
  });

  it('refuses an undo once the daily quota is spent', async () => {
    prisma.unionSwipe.count.mockResolvedValue(UNDO_PER_DAY);

    await expect(service.undoLast('user-1')).rejects.toThrow(
      'Откаты на сегодня закончились',
    );
    expect(prisma.unionSwipe.findFirst).not.toHaveBeenCalled();
  });

  it('undoes the last swipe and cancels the pending request', async () => {
    prisma.unionSwipe.findFirst.mockResolvedValue(swipe());
    prisma.unionConnectionRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
    });

    await expect(service.undoLast('user-1')).resolves.toEqual({
      toUserId: 'user-2',
      decision: 'like',
    });
    expect(prisma.unionConnectionRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'cancelled', respondedAt: now },
    });
    expect(prisma.unionSwipe.update).toHaveBeenCalledWith({
      where: { id: 'swipe-1' },
      data: { undoneAt: now },
    });
  });

  it('refuses to undo a swipe that already turned into a match', async () => {
    prisma.unionSwipe.findFirst.mockResolvedValue(swipe());
    prisma.unionConnectionRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      status: 'accepted',
    });

    await expect(service.undoLast('user-1')).rejects.toThrow(
      'Знакомство уже состоялось',
    );
    expect(prisma.unionSwipe.update).not.toHaveBeenCalled();
  });

  it('undoes a pass without touching connection requests', async () => {
    prisma.unionSwipe.findFirst.mockResolvedValue(swipe({ decision: 'pass' }));

    await expect(service.undoLast('user-1')).resolves.toEqual({
      toUserId: 'user-2',
      decision: 'pass',
    });
    expect(prisma.unionConnectionRequest.findUnique).not.toHaveBeenCalled();
  });

  it('fails when there is nothing to undo', async () => {
    prisma.unionSwipe.findFirst.mockResolvedValue(null);

    await expect(service.undoLast('user-1')).rejects.toThrow(
      'Откатывать нечего',
    );
  });

  it('restores every swiped profile except accepted matches', async () => {
    prisma.unionSwipe.findMany.mockResolvedValue([
      swipe({ id: 'swipe-1', toUserId: 'user-2', decision: 'pass' }),
      swipe({ id: 'swipe-2', toUserId: 'user-3', decision: 'like' }),
      swipe({ id: 'swipe-3', toUserId: 'user-4', decision: 'like' }),
    ]);
    prisma.unionConnectionRequest.findUnique
      .mockResolvedValueOnce({ id: 'request-3', status: 'pending' })
      .mockResolvedValueOnce({ id: 'request-4', status: 'accepted' });

    await expect(service.resetHistory('user-1')).resolves.toEqual({
      restoredCount: 2,
    });

    expect(prisma.unionConnectionRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-3' },
      data: { status: 'cancelled', respondedAt: now },
    });
    expect(prisma.unionSwipe.update).toHaveBeenCalledWith({
      where: { id: 'swipe-1' },
      data: { undoneAt: now },
    });
    expect(prisma.unionSwipe.update).toHaveBeenCalledWith({
      where: { id: 'swipe-2' },
      data: { undoneAt: now },
    });
    expect(prisma.unionSwipe.update).not.toHaveBeenCalledWith({
      where: { id: 'swipe-3' },
      data: expect.anything(),
    });
  });

  it('lists swiped users without the undone ones', async () => {
    prisma.unionSwipe.findMany.mockResolvedValue([
      { toUserId: 'user-2' },
      { toUserId: 'user-3' },
    ]);

    await expect(service.swipedUserIds('user-1')).resolves.toEqual(
      new Set(['user-2', 'user-3']),
    );
    expect(prisma.unionSwipe.findMany).toHaveBeenCalledWith({
      where: { fromUserId: 'user-1', undoneAt: null },
      select: { toUserId: true },
    });
  });
});
