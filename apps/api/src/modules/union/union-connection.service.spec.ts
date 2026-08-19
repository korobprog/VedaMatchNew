import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { UnionConnectionService } from './union-connection.service';

const createdAt = new Date('2026-07-10T10:00:00.000Z');

function user(id: string) {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatarUrl: null,
    avatarKey: null,
    homeLocation: null,
    socialLinks: {},
    messengers: {},
    role: 'user',
    googleId: null,
    spiritualStage: null as string | null,
    devoteeVerificationStatus: null as string | null,
    lastSelfIdentificationAt: null,
    createdAt,
    updatedAt: createdAt,
    unionProfile: { privacy: null },
  };
}

function profile(userId: string) {
  return {
    id: `profile-${userId}`,
    userId,
    isActive: true,
    requestsFromVerifiedOnly: false,
    user: user(userId),
  };
}

function connection(
  options: {
    id?: string;
    fromUserId?: string;
    toUserId?: string;
    status?: 'pending' | 'accepted' | 'declined';
  } = {},
) {
  const fromUserId = options.fromUserId ?? 'sender';
  const toUserId = options.toUserId ?? 'recipient';
  const status = options.status ?? 'pending';
  return {
    id: options.id ?? 'request-1',
    fromUserId,
    toUserId,
    status,
    message: 'Hello',
    createdAt,
    respondedAt: status === 'pending' ? null : createdAt,
    fromUser: user(fromUserId),
    toUser: user(toUserId),
  };
}

describe('UnionConnectionService', () => {
  const prisma = {
    unionProfile: {
      findUnique: jest.fn(),
    },
    unionConnectionRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const moderation = {
    isHidden: jest.fn().mockResolvedValue(false),
    hideFrom: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    resolveAvatarUrl: jest.fn(
      async (u: { avatarKey: string | null; avatarUrl: string | null }) =>
        u.avatarKey ? 'https://signed.example/avatar' : u.avatarUrl,
    ),
  };
  const service = new UnionConnectionService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    users as never,
    { emit: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    moderation.isHidden.mockResolvedValue(false);
    moderation.hideFrom.mockResolvedValue(undefined);
    jest.useFakeTimers().setSystemTime(createdAt);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts only incoming pending requests', async () => {
    prisma.unionConnectionRequest.count.mockResolvedValue(3);

    await expect(service.counts('user-1')).resolves.toEqual({
      incomingPending: 3,
    });
    expect(prisma.unionConnectionRequest.count).toHaveBeenCalledWith({
      where: { toUserId: 'user-1', status: 'pending' },
    });
  });

  it('rejects a request to yourself', async () => {
    await expect(
      service.create('user-1', { toUserId: 'user-1' }),
    ).rejects.toThrow('Cannot send a request to yourself');
    expect(prisma.unionProfile.findUnique).not.toHaveBeenCalled();
  });

  it('blocks a request when the recipient accepts only confirmed devotees', async () => {
    const recipient = profile('user-2');
    recipient.requestsFromVerifiedOnly = true;
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('user-1'))
      .mockResolvedValueOnce(recipient);

    await expect(
      service.create('user-1', { toUserId: 'user-2' }),
    ).rejects.toThrow('принимает запросы только от преданных');
    expect(prisma.unionConnectionRequest.upsert).not.toHaveBeenCalled();
  });

  it('allows a confirmed devotee through the verified-only gate', async () => {
    const sender = profile('user-1');
    sender.user.spiritualStage = 'devotee';
    sender.user.devoteeVerificationStatus = 'confirmed';
    const recipient = profile('user-2');
    recipient.requestsFromVerifiedOnly = true;
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(sender)
      .mockResolvedValueOnce(recipient);
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(null);
    prisma.unionConnectionRequest.upsert.mockResolvedValue(
      connection({ fromUserId: 'user-1', toUserId: 'user-2' }),
    );

    await expect(
      service.create('user-1', { toUserId: 'user-2' }),
    ).resolves.toEqual(expect.objectContaining({ direction: 'outgoing' }));
  });

  it('accepts a reverse pending request instead of creating a duplicate', async () => {
    const reverse = connection({
      fromUserId: 'user-2',
      toUserId: 'user-1',
    });
    const accepted = connection({
      fromUserId: 'user-2',
      toUserId: 'user-1',
      status: 'accepted',
    });
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('user-1'))
      .mockResolvedValueOnce(profile('user-2'));
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(reverse);
    prisma.unionConnectionRequest.update.mockResolvedValue(accepted);

    await expect(
      service.create('user-1', { toUserId: 'user-2' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'request-1',
        direction: 'incoming',
        status: 'accepted',
      }),
    );
    expect(prisma.unionConnectionRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'accepted', respondedAt: createdAt },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    expect(prisma.unionConnectionRequest.upsert).not.toHaveBeenCalled();
  });

  it('does not reset an accepted direct request back to pending on a repeated like', async () => {
    const accepted = connection({
      fromUserId: 'user-1',
      toUserId: 'user-2',
      status: 'accepted',
    });
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('user-1'))
      .mockResolvedValueOnce(profile('user-2'));
    // Первый findUnique — обратная заявка (нет), второй — прямая (accepted).
    prisma.unionConnectionRequest.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(accepted);

    await expect(
      service.create('user-1', { toUserId: 'user-2' }),
    ).resolves.toEqual(
      expect.objectContaining({ direction: 'outgoing', status: 'accepted' }),
    );
    expect(prisma.unionConnectionRequest.upsert).not.toHaveBeenCalled();
    expect(prisma.unionConnectionRequest.update).not.toHaveBeenCalled();
  });

  it('keeps a pending direct request as is and does not notify twice', async () => {
    const pending = connection({ fromUserId: 'user-1', toUserId: 'user-2' });
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('user-1'))
      .mockResolvedValueOnce(profile('user-2'));
    prisma.unionConnectionRequest.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);

    await expect(
      service.create('user-1', { toUserId: 'user-2' }),
    ).resolves.toEqual(
      expect.objectContaining({ direction: 'outgoing', status: 'pending' }),
    );
    expect(prisma.unionConnectionRequest.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['accept', 'stranger', 'pending', 'Not your request'],
    ['decline', 'stranger', 'pending', 'Not your request'],
    [
      'accept',
      'recipient',
      'accepted',
      'Only pending requests can be accepted',
    ],
    [
      'decline',
      'recipient',
      'accepted',
      'Only pending requests can be declined',
    ],
  ] as const)(
    'rejects %s when authorization or status is invalid',
    async (method, userId, status, expectedMessage) => {
      prisma.unionConnectionRequest.findUnique.mockResolvedValue(
        connection({ status }),
      );

      await expect(service[method](userId, 'request-1')).rejects.toThrow(
        expectedMessage,
      );
      expect(prisma.unionConnectionRequest.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['accept', 'accepted'],
    ['decline', 'declined'],
  ] as const)(
    'allows the recipient to %s a pending request',
    async (method, savedStatus) => {
      prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
      prisma.unionConnectionRequest.update.mockResolvedValue(
        connection({ status: savedStatus }),
      );

      await expect(service[method]('recipient', 'request-1')).resolves.toEqual(
        expect.objectContaining({
          direction: 'incoming',
          status: savedStatus,
        }),
      );
      expect(prisma.unionConnectionRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: savedStatus, respondedAt: createdAt },
        // accept дополнительно грузит toUser: его имя уходит в уведомление
        // отправителю заявки. Отказ никого не уведомляет.
        include:
          method === 'accept'
            ? { fromUser: { include: { unionProfile: true } }, toUser: true }
            : { fromUser: { include: { unionProfile: true } } },
      });
    },
  );

  it('hides the person who declined from the sender', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
    prisma.unionConnectionRequest.update.mockResolvedValue(
      connection({ status: 'declined' }),
    );

    await service.decline('recipient', 'request-1');

    expect(moderation.hideFrom).toHaveBeenCalledWith({
      ownerId: 'recipient',
      viewerId: 'sender',
      source: 'union_declined',
    });
  });

  it('does not hide anyone when a request is accepted', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
    prisma.unionConnectionRequest.update.mockResolvedValue(
      connection({ status: 'accepted' }),
    );

    await service.accept('recipient', 'request-1');

    expect(moderation.hideFrom).not.toHaveBeenCalled();
  });

  it('leaves the request pending when the hide fails', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
    moderation.hideFrom.mockRejectedValue(new Error('db down'));

    await expect(service.decline('recipient', 'request-1')).rejects.toThrow(
      'db down',
    );
    // Отказ без скрытия хуже, чем неудавшийся отказ: повторить можно только
    // пока заявка pending.
    expect(prisma.unionConnectionRequest.update).not.toHaveBeenCalled();
  });
});
