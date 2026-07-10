import { PrismaService } from '../../prisma/prisma.service';
import { UnionChatService } from './union-chat.service';

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
    spiritualStage: null,
    devoteeVerificationStatus: null,
    lastSelfIdentificationAt: null,
    createdAt,
    updatedAt: createdAt,
    unionProfile: { privacy: null },
  };
}

function connection(status: 'pending' | 'accepted' = 'accepted') {
  return {
    id: 'request-1',
    fromUserId: 'sender',
    toUserId: 'recipient',
    status,
    message: 'Hello',
    createdAt,
    respondedAt: status === 'accepted' ? createdAt : null,
    fromUser: user('sender'),
    toUser: user('recipient'),
  };
}

describe('UnionChatService', () => {
  const prisma = {
    unionConnectionRequest: {
      findUnique: jest.fn(),
    },
    unionChatMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new UnionChatService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects chat access for a user outside the connection', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());

    await expect(service.getChat('stranger', 'request-1')).rejects.toThrow(
      'Not your chat',
    );
    expect(prisma.unionChatMessage.findMany).not.toHaveBeenCalled();
  });

  it('rejects chat access before the connection is accepted', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(
      connection('pending'),
    );

    await expect(service.getChat('sender', 'request-1')).rejects.toThrow(
      'Chat is available only after a match',
    );
    expect(prisma.unionChatMessage.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['sender', 'recipient', 'outgoing'],
    ['recipient', 'sender', 'incoming'],
  ] as const)(
    'loads an accepted chat for %s with the opposite participant',
    async (userId, otherUserId, direction) => {
      prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
      prisma.unionChatMessage.findMany.mockResolvedValue([]);

      const result = await service.getChat(userId, 'request-1');

      expect(result.connection.direction).toBe(direction);
      expect(result.otherUser.id).toBe(otherUserId);
      expect(result.messages).toEqual([]);
      expect(prisma.unionChatMessage.findMany).toHaveBeenCalledWith({
        where: { requestId: 'request-1' },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
    },
  );

  it('sends a trimmed message in an accepted chat', async () => {
    prisma.unionConnectionRequest.findUnique.mockResolvedValue(connection());
    prisma.unionChatMessage.create.mockResolvedValue({
      id: 'message-1',
      requestId: 'request-1',
      fromUserId: 'sender',
      body: 'Namaste',
      createdAt,
    });

    await expect(
      service.sendMessage('sender', 'request-1', { body: '  Namaste  ' }),
    ).resolves.toEqual({
      id: 'message-1',
      requestId: 'request-1',
      fromUserId: 'sender',
      body: 'Namaste',
      mine: true,
      createdAt: createdAt.toISOString(),
    });
    expect(prisma.unionChatMessage.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        fromUserId: 'sender',
        body: 'Namaste',
      },
    });
  });
});
