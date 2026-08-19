/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommunityMembersService } from './community-members.service';

describe('CommunityMembersService', () => {
  const prisma = {
    community: { findUnique: jest.fn(), update: jest.fn() },
    communityMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    communityOwnershipTransfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // Транзакция исполняется тем же моком: инвариант «основная община одна»
    // держится порядком вызовов, а не самой транзакцией.
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const service = new CommunityMembersService(prisma);

  const membership = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    communityId: 'c1',
    userId: 'u1',
    role: 'member',
    status: 'active',
    title: null,
    isPrimary: false,
    isPublic: true,
    joinedAt: new Date(),
    decidedById: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.communityMember.count.mockResolvedValue(0);
    prisma.community.update.mockResolvedValue({});
    prisma.communityMember.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('join', () => {
    it('в открытую общину вступают сразу', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'open',
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityMember.findFirst.mockResolvedValue(null);
      prisma.communityMember.create.mockResolvedValue(
        membership({ status: 'active' }),
      );

      const result = await service.join('u1', 'c1', {});

      expect(result.status).toBe('active');
      expect(prisma.communityMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('первая община человека сразу становится основной', async () => {
      // Иначе значок в профиле показан, а переключатель «основная» не
      // отмечен ни у чего — расхождение, которое видно глазами.
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'open',
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityMember.findFirst.mockResolvedValue(null);
      prisma.communityMember.create.mockResolvedValue(
        membership({ status: 'active' }),
      );
      prisma.communityMember.update.mockResolvedValue(
        membership({ isPrimary: true }),
      );

      await service.join('u1', 'c1', {});

      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPrimary: true } }),
      );
    });

    it('вторая община основной не становится', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'open',
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);
      // У человека уже есть основная община.
      prisma.communityMember.findFirst.mockResolvedValue({ id: 'other' });
      prisma.communityMember.create.mockResolvedValue(
        membership({ status: 'active' }),
      );

      await service.join('u1', 'c1', {});

      expect(prisma.communityMember.update).not.toHaveBeenCalled();
    });

    it('в закрытую — заявкой', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'request_approval',
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityMember.create.mockResolvedValue(
        membership({ status: 'pending', joinedAt: null }),
      );

      const result = await service.join('u1', 'c1', {});
      expect(result.status).toBe('pending');
    });

    it('в invite_only заявку подать нельзя', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'invite_only',
      });

      await expect(service.join('u1', 'c1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('неподтверждённая община не принимает никого', async () => {
      // Заявка в общину, которую ещё не разобрал админ портала, — это
      // способ обойти премодерацию.
      prisma.community.findUnique.mockResolvedValue({
        status: 'pending',
        joinPolicy: 'open',
      });

      await expect(service.join('u1', 'c1', {})).rejects.toThrow(
        'Община не найдена',
      );
    });

    it('исключённый не возвращается сам', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        joinPolicy: 'open',
      });
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ status: 'removed', decidedAt: new Date('2020-01-01') }),
      );

      await expect(service.join('u1', 'c1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('leave', () => {
    it('владелец не уходит, пока не передал общину', async () => {
      // Иначе община осталась бы без единственной роли, которая может её
      // восстановить.
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ role: 'owner' }),
      );

      await expect(service.leave('u1', 'c1')).rejects.toThrow(
        /передайте владение/,
      );
    });

    it('участник уходит и теряет значок в профиле', async () => {
      prisma.communityMember.findUnique.mockResolvedValue(membership());
      prisma.communityMember.update.mockResolvedValue(membership());

      await service.leave('u1', 'c1');

      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'left', isPrimary: false }),
        }),
      );
    });
  });

  describe('updateOwn', () => {
    it('основная община ровно одна: с прежней флаг снимается', async () => {
      prisma.communityMember.findUnique.mockResolvedValue(membership());
      prisma.communityMember.update.mockResolvedValue(
        membership({ isPrimary: true }),
      );

      await service.updateOwn('u1', 'c1', { isPrimary: true });

      expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isPrimary: true, communityId: { not: 'c1' } },
        data: { isPrimary: false },
      });
    });

    it('снятие флага чужие общины не трогает', async () => {
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ isPrimary: true }),
      );
      prisma.communityMember.update.mockResolvedValue(membership());

      await service.updateOwn('u1', 'c1', { isPrimary: false });

      expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
    });

    it('не состоящий в общине ничего не меняет', async () => {
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ status: 'pending' }),
      );

      await expect(
        service.updateOwn('u1', 'c1', { isPublic: false }),
      ).rejects.toThrow('Вы не состоите в этой общине');
    });
  });

  describe('remove', () => {
    it('владельца исключить нельзя', async () => {
      prisma.communityMember.findUnique
        .mockResolvedValueOnce(membership({ userId: 'actor', role: 'admin' }))
        .mockResolvedValueOnce(membership({ userId: 'u2', role: 'owner' }));

      await expect(service.remove('actor', 'c1', 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('админа исключает только владелец', async () => {
      prisma.communityMember.findUnique
        .mockResolvedValueOnce(membership({ userId: 'actor', role: 'admin' }))
        .mockResolvedValueOnce(membership({ userId: 'u2', role: 'admin' }));

      await expect(service.remove('actor', 'c1', 'u2')).rejects.toThrow(
        'Админа исключает только владелец',
      );
    });
  });

  describe('respondToTransfer', () => {
    const transfer = {
      id: 't1',
      communityId: 'c1',
      fromUserId: 'owner',
      toUserId: 'heir',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      declinedAt: null,
      community: { name: 'Ятра' },
      fromUser: { name: 'Пётр', spiritualName: null },
      toUser: { name: 'Иван', spiritualName: 'Ишвара дас' },
    };

    it('принятие меняет обе роли, а не одну', async () => {
      // Полшага здесь оставили бы общину либо с двумя владельцами, либо ни с одним.
      prisma.communityOwnershipTransfer.findUnique.mockResolvedValue(transfer);
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ userId: 'heir' }),
      );
      prisma.communityMember.update.mockResolvedValue(membership());
      prisma.communityOwnershipTransfer.update.mockResolvedValue({
        ...transfer,
        acceptedAt: new Date(),
      });

      await service.respondToTransfer('heir', 't1', true);

      const roles = prisma.communityMember.update.mock.calls.map(
        (call) => (call[0] as { data: { role: string } }).data.role,
      );
      expect(roles).toEqual(['admin', 'owner']);
    });

    it('протухшее предложение не принимается', async () => {
      prisma.communityOwnershipTransfer.findUnique.mockResolvedValue({
        ...transfer,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.respondToTransfer('heir', 't1', true),
      ).rejects.toThrow('Срок предложения истёк');
    });

    it('чужое предложение не видно', async () => {
      prisma.communityOwnershipTransfer.findUnique.mockResolvedValue(transfer);

      await expect(
        service.respondToTransfer('stranger', 't1', true),
      ).rejects.toThrow('Передача не найдена');
    });
  });

  describe('list', () => {
    const memberUser = {
      name: 'Иван',
      spiritualName: null,
      avatarUrl: null,
      homeLocation: null,
    };

    it('чужому гостю отдаёт активную общину', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'active',
        createdById: 'owner',
      });
      prisma.communityMember.findMany.mockResolvedValue([
        { ...membership(), user: memberUser },
      ]);

      const result = await service.list('c1', undefined, {}, false);

      expect(result.items).toHaveLength(1);
    });

    it('чужому гостю не отдаёт общину, ждущую проверки', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'pending',
        createdById: 'owner',
      });

      await expect(service.list('c1', 'stranger', {}, false)).rejects.toThrow(
        'Община не найдена',
      );
    });

    it('создателю отдаёт список сразу после заведения общины', async () => {
      // Регресс: bySlug() уже пускал создателя к карточке `pending`, а
      // list() проверял только isReachable(status) — список из него самого
      // 404-ил, и вся страница только что созданной общины разваливалась
      // на «Община не найдена», хотя карточка была отдана секундой раньше.
      prisma.community.findUnique.mockResolvedValue({
        status: 'pending',
        createdById: 'owner',
      });
      prisma.communityMember.findUnique.mockResolvedValue(
        membership({ userId: 'owner', role: 'owner' }),
      );
      prisma.communityMember.findMany.mockResolvedValue([
        { ...membership({ userId: 'owner', role: 'owner' }), user: memberUser },
      ]);

      const result = await service.list('c1', 'owner', {}, false);

      expect(result.items).toHaveLength(1);
    });

    it('портальному админу отдаёт любую общину', async () => {
      prisma.community.findUnique.mockResolvedValue({
        status: 'pending',
        createdById: 'owner',
      });
      prisma.communityMember.findMany.mockResolvedValue([]);

      await expect(service.list('c1', 'admin-user', {}, true)).resolves.toEqual(
        expect.objectContaining({ items: [] }),
      );
    });

    it('несуществующую общину не путает с недоступной', async () => {
      prisma.community.findUnique.mockResolvedValue(null);

      await expect(
        service.list('missing', undefined, {}, false),
      ).rejects.toThrow('Община не найдена');
    });
  });
});
