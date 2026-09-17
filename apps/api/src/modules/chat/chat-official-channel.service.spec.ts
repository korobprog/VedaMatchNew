import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { ChatOfficialChannelService } from './chat-official-channel.service';

function makePrisma(channel: { id: string; title: string } | null) {
  return {
    chatConversation: { findFirst: jest.fn().mockResolvedValue(channel) },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    chatMember: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

interface MemberRow {
  conversationId: string;
  userId: string;
  role: string;
  mutedUntil: Date | null;
}
type CreateManyArgs = { data: MemberRow[]; skipDuplicates: boolean };
type FindManyArgs = { where: unknown };

function createManyArgs(prisma: ReturnType<typeof makePrisma>, index = 0) {
  const calls = prisma.chatMember.createMany.mock.calls as [CreateManyArgs][];
  return calls[index][0];
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ChatOfficialChannelService(prisma as unknown as PrismaService);
}

describe('ChatOfficialChannelService', () => {
  it('подписывает новичка заглушённым участником и не трогает существующую строку', async () => {
    const prisma = makePrisma({ id: 'c1', title: 'VedaMatch' });
    prisma.user.findUnique.mockResolvedValue({ role: 'user' });

    await makeService(prisma).subscribeNewcomer('u1');

    const call = createManyArgs(prisma);
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      conversationId: 'c1',
      userId: 'u1',
      role: 'member',
    });
    expect(call.data[0].mutedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('администратор портала подписывается администратором канала без глушения', async () => {
    const prisma = makePrisma({ id: 'c1', title: 'VedaMatch' });
    prisma.user.findUnique.mockResolvedValue({ role: 'admin' });

    await makeService(prisma).subscribeNewcomer('a1');

    expect(createManyArgs(prisma).data[0]).toMatchObject({
      role: 'admin',
      mutedUntil: null,
    });
  });

  it('без канала новичка не подписывает и не падает', async () => {
    const prisma = makePrisma(null);
    prisma.user.findUnique.mockResolvedValue({ role: 'user' });

    await expect(
      makeService(prisma).subscribeNewcomer('u1'),
    ).resolves.toBeUndefined();
    expect(prisma.chatMember.createMany).not.toHaveBeenCalled();
  });

  it('ошибка базы при подписке не всплывает в регистрацию', async () => {
    const prisma = makePrisma({ id: 'c1', title: 'VedaMatch' });
    prisma.user.findUnique.mockResolvedValue({ role: 'user' });
    prisma.chatMember.createMany.mockRejectedValue(new Error('db down'));

    await expect(
      makeService(prisma).subscribeNewcomer('u1'),
    ).resolves.toBeUndefined();
  });

  it('«Подписать всех» берёт только активных без строки членства', async () => {
    const prisma = makePrisma({ id: 'c1', title: 'VedaMatch' });
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', role: 'user' },
      { id: 'u2', role: 'admin' },
    ]);
    prisma.chatMember.createMany.mockResolvedValue({ count: 2 });

    const result = await makeService(prisma).syncMembers();

    expect(
      (prisma.user.findMany.mock.calls as [FindManyArgs][])[0][0].where,
    ).toEqual({
      accountStatus: 'active',
      chatMemberships: { none: { conversationId: 'c1' } },
    });
    expect(prisma.chatMember.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1', role: 'member', user: { role: 'admin' } },
      data: { role: 'admin' },
    });
    expect(result.added).toBe(2);
    expect(result.conversationId).toBe('c1');
  });

  it('сводка без канала отвечает 404', async () => {
    await expect(makeService(makePrisma(null)).stats()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
