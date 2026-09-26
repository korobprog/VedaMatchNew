import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { WorkSpacesService } from './work-spaces.service';
import type { WorkAvatarService } from './work-avatar.service';

/**
 * Приём ИИ-агента в среду. Единственный путь, которым служебный аккаунт туда
 * попадает: приглашение ждёт согласия, а согласиться ему нечем.
 */
function createService(options: {
  actorRole?: string | null;
  agent?: { id: string; isAgent: boolean } | null;
  alreadyMember?: boolean;
  agents?: unknown[];
}) {
  const memberFindUnique = jest.fn(
    ({ where }: { where: { spaceId_userId: { userId: string } } }) => {
      const { userId } = where.spaceId_userId;
      if (userId === 'sevak') {
        return Promise.resolve(
          options.alreadyMember ? { userId: 'sevak', role: 'member' } : null,
        );
      }
      return Promise.resolve(
        options.actorRole ? { role: options.actorRole } : null,
      );
    },
  );
  const memberCreate = jest.fn().mockResolvedValue({});
  const userFindMany = jest.fn().mockResolvedValue(options.agents ?? []);
  const prisma = {
    workSpaceMember: { findUnique: memberFindUnique, create: memberCreate },
    user: {
      findUnique: jest.fn().mockResolvedValue(options.agent ?? null),
      findMany: userFindMany,
    },
  } as unknown as PrismaService;
  const avatars = {
    signAvatars: jest.fn(() => Promise.resolve()),
  } as unknown as WorkAvatarService;
  return {
    service: new WorkSpacesService(prisma, avatars),
    memberCreate,
    userFindMany,
  };
}

describe('WorkSpacesService.agentsForSpace', () => {
  it('список видит только тот, кто распоряжается составом среды', async () => {
    const { service, userFindMany } = createService({ actorRole: 'member' });
    await expect(service.agentsForSpace('s1', 'u1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('людей в списке нет, а уже принятые из него уходят', async () => {
    const { service, userFindMany } = createService({ actorRole: 'owner' });
    await service.agentsForSpace('s1', 'u1');
    // Кнопка не должна предлагать сделать то, что уже сделано.
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAgent: true,
          workMemberships: { none: { spaceId: 's1' } },
        }),
      }),
    );
  });

  it('имя агента наружу едет духовное, как у любого профиля', async () => {
    const { service } = createService({
      actorRole: 'admin',
      agents: [
        {
          id: 'sevak',
          name: 'Sevak',
          spiritualName: 'Севак',
          avatarUrl: null,
          isAgent: true,
        },
      ],
    });
    await expect(service.agentsForSpace('s1', 'u1')).resolves.toEqual([
      { userId: 'sevak', name: 'Севак', isAgent: true },
    ]);
  });
});

describe('WorkSpacesService.addAgent', () => {
  const agent = { id: 'sevak', isAgent: true };

  it('распорядитель среды вводит агента участником', async () => {
    const { service, memberCreate } = createService({
      actorRole: 'owner',
      agent,
    });
    await service.addAgent('s1', 'u1', 'sevak');
    // Роль ровно `member`: раздавать роли и выгонять людей — не дело агента.
    expect(memberCreate).toHaveBeenCalledWith({
      data: { spaceId: 's1', userId: 'sevak', role: 'member' },
    });
  });

  it('участник без прав на состав среды агента не заводит', async () => {
    const { service, memberCreate } = createService({
      actorRole: 'member',
      agent,
    });
    await expect(service.addAgent('s1', 'u1', 'sevak')).rejects.toThrow(
      ForbiddenException,
    );
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('живого человека этим путём в среду не втаскивают', async () => {
    // У человека есть приглашение, которое он вправе и не принять.
    const { service, memberCreate } = createService({
      actorRole: 'owner',
      agent: { id: 'sevak', isAgent: false },
    });
    await expect(service.addAgent('s1', 'u1', 'sevak')).rejects.toThrow(
      BadRequestException,
    );
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('повторный приём ничего не ломает и не задваивает', async () => {
    const { service, memberCreate } = createService({
      actorRole: 'admin',
      agent,
      alreadyMember: true,
    });
    await expect(
      service.addAgent('s1', 'u1', 'sevak'),
    ).resolves.toBeUndefined();
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
