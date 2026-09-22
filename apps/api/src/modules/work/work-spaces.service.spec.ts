import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { WorkSpacesService } from './work-spaces.service';

/**
 * Приём ИИ-агента в среду. Единственный путь, которым служебный аккаунт туда
 * попадает: приглашение ждёт согласия, а согласиться ему нечем.
 */
function createService(options: {
  actorRole?: string | null;
  agent?: { id: string; isAgent: boolean } | null;
  alreadyMember?: boolean;
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
  const prisma = {
    workSpaceMember: { findUnique: memberFindUnique, create: memberCreate },
    user: { findUnique: jest.fn().mockResolvedValue(options.agent ?? null) },
  } as unknown as PrismaService;
  return { service: new WorkSpacesService(prisma), memberCreate };
}

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
