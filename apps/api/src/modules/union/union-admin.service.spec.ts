import { BadRequestException, NotFoundException } from '@nestjs/common';
import { buildProfileWhere, UnionAdminService } from './union-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('buildProfileWhere', () => {
  it('пустой запрос не фильтрует', () => {
    expect(buildProfileWhere({})).toEqual({});
    expect(buildProfileWhere({ visibility: 'all' })).toEqual({});
  });

  it('различает анкеты в выдаче и снятые', () => {
    expect(buildProfileWhere({ visibility: 'active' })).toEqual({
      isActive: true,
    });
    expect(buildProfileWhere({ visibility: 'hidden' })).toEqual({
      isActive: false,
    });
  });

  it('ищет и по мирскому имени, и по духовному, и по почте', () => {
    expect(buildProfileWhere({ q: ' Сита ' })).toEqual({
      user: {
        OR: [
          { name: { contains: 'Сита', mode: 'insensitive' } },
          { spiritualName: { contains: 'Сита', mode: 'insensitive' } },
          { email: { contains: 'Сита', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('пустой поиск не превращается в фильтр по пустой строке', () => {
    expect(buildProfileWhere({ q: '   ' })).toEqual({});
  });
});

function createService(options: { profileExists?: boolean } = {}) {
  const found = options.profileExists ?? true;
  const prisma = {
    unionProfile: {
      updateMany: jest.fn(() => Promise.resolve({ count: found ? 1 : 0 })),
      findUnique: jest.fn(() => Promise.resolve(null)),
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
    userReport: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      groupBy: jest.fn(() => Promise.resolve([])),
    },
    unionConnectionRequest: { findFirst: jest.fn(() => Promise.resolve(null)) },
    unionChatMessage: { findMany: jest.fn(() => Promise.resolve([])) },
    userPhoto: { groupBy: jest.fn(() => Promise.resolve([])) },
  };
  const events = { emit: jest.fn() };
  const service = new UnionAdminService(
    prisma as unknown as PrismaService,
    events as never,
  );
  return { service, prisma, events };
}

describe('UnionAdminService.hideProfile', () => {
  it('требует внятную причину: анкету снимают, человек об этом узнает', async () => {
    const { service, prisma } = createService();

    await expect(
      service.hideProfile('admin-1', 'u-1', { reason: 'спам' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unionProfile.updateMany).not.toHaveBeenCalled();
  });

  it('снимает анкету с выдачи и оставляет след в журнале', async () => {
    const { service, prisma, events } = createService();
    jest.spyOn(service, 'profile').mockResolvedValue({} as never);

    await service.hideProfile('admin-1', 'u-1', {
      reason: 'фальшивая анкета',
    });

    expect(prisma.unionProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      data: { isActive: false },
    });
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'union.profile-hidden',
      targetType: 'user',
      targetId: 'u-1',
      details: { reason: 'фальшивая анкета' },
    });
  });

  it('несуществующую анкету не прячет', async () => {
    const { service } = createService({ profileExists: false });

    await expect(
      service.hideProfile('admin-1', 'u-1', { reason: 'фальшивая анкета' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UnionAdminService.restoreProfile', () => {
  it('возвращает анкету в выдачу', async () => {
    const { service, prisma, events } = createService();
    jest.spyOn(service, 'profile').mockResolvedValue({} as never);

    await service.restoreProfile('admin-1', 'u-1');

    expect(prisma.unionProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      data: { isActive: true },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({ action: 'union.profile-restored' }),
    );
  });
});

describe('UnionAdminService.chatByReport', () => {
  it('без жалобы переписку не отдаёт', async () => {
    const { service, prisma } = createService();

    await expect(service.chatByReport('admin-1', 'r-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.unionChatMessage.findMany).not.toHaveBeenCalled();
  });

  it('заявки между парой не было — переписки нет, и в базу за ней не идём', async () => {
    const { service, prisma } = createService();
    prisma.userReport.findUnique.mockResolvedValue({
      id: 'r-1',
      reporterId: 'u-1',
      targetId: 'u-2',
      reporter: { name: 'Сита', spiritualName: null },
      target: { name: 'Арджуна', spiritualName: null },
    } as never);

    const chat = await service.chatByReport('admin-1', 'r-1');

    expect(chat.messages).toEqual([]);
    expect(prisma.unionChatMessage.findMany).not.toHaveBeenCalled();
  });

  it('просмотр личной переписки пишется в журнал', async () => {
    const { service, prisma, events } = createService();
    prisma.userReport.findUnique.mockResolvedValue({
      id: 'r-1',
      reporterId: 'u-1',
      targetId: 'u-2',
      reporter: { name: 'Сита', spiritualName: null },
      target: { name: 'Арджуна', spiritualName: null },
    } as never);
    prisma.unionConnectionRequest.findFirst.mockResolvedValue({
      id: 'req-1',
    } as never);
    prisma.unionChatMessage.findMany.mockResolvedValue([
      {
        id: 'm-1',
        fromUserId: 'u-2',
        body: 'привет',
        editedAt: null,
        createdAt: new Date('2026-08-21T10:00:00.000Z'),
        fromUser: { name: 'Арджуна', spiritualName: 'Арджуна дас' },
      },
    ] as never);

    const chat = await service.chatByReport('admin-1', 'r-1');

    expect(chat.messages).toHaveLength(1);
    // Мирское имя: разбирая жалобу, надо понимать, кто именно перед тобой.
    expect(chat.messages[0].fromName).toBe('Арджуна');
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'union.chat-viewed',
      targetType: 'user',
      targetId: 'u-2',
      details: { reportId: 'r-1', messages: 1 },
    });
  });
});
