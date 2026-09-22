import { ForbiddenException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService(
  overrides: Record<string, unknown> = {},
  users: Record<string, unknown> = {},
) {
  const findMany = jest.fn().mockResolvedValue([]);
  const update = jest.fn().mockResolvedValue({});
  const count = jest.fn().mockResolvedValue(0);
  const create = jest.fn().mockResolvedValue({ id: 'k1' });
  const userFindUnique = jest.fn().mockResolvedValue(null);
  const userFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    userApiKey: { findMany, update, count, create, ...overrides },
    user: { findUnique: userFindUnique, findMany: userFindMany, ...users },
  } as unknown as PrismaService;
  return {
    service: new ApiKeysService(prisma),
    findMany,
    update,
    count,
    create,
    userFindUnique,
    userFindMany,
  };
}

/** Живой служебный аккаунт — то, что возвращает база на проверке агента. */
function agentAccount(isAgent = true) {
  return jest.fn().mockResolvedValue({ id: 'sevak', isAgent });
}

describe('ApiKeysService для администрации', () => {
  it('администратор видит ключи любого человека', async () => {
    const { service, findMany } = createService();
    await service.listForAdmin('admin', 'u1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('погашенные ключи из списка не пропадают', async () => {
    const { service, findMany } = createService();
    await service.listForAdmin('admin', 'u1');
    // Отсутствие строки не объясняет, почему интеграция перестала работать.
    const call = findMany.mock.calls[0][0] as { select: { revoked?: boolean } };
    expect(call.select.revoked).toBe(true);
  });

  it('админ сервиса до чужих ключей не допускается', async () => {
    const { service } = createService();
    await expect(service.listForAdmin('service-admin', 'u1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.revokeAsAdmin('service-admin', 'k1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('обычный пользователь — тем более', async () => {
    const { service, update } = createService();
    await expect(service.revokeAsAdmin('user', 'k1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ApiKeysService.issue', () => {
  it('не выпускает одиннадцатый ключ', async () => {
    const { service } = createService({
      count: jest.fn().mockResolvedValue(10),
    });
    await expect(
      service.issue('u1', 'ещё один', ['work:read'], null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ключ уезжает владельцу целиком, а в базу — отпечатком', async () => {
    const { service, create } = createService();
    const issued = await service.issue('u1', 'Claude', ['work:read'], null);
    expect(issued.token.startsWith('vm_')).toBe(true);
    const data = create.mock.calls[0][0].data as {
      tokenHash: string;
      hint: string;
    };
    expect(data.tokenHash).not.toContain(issued.token);
    expect(data.hint).toBe(`vm_…${issued.token.slice(-4)}`);
  });
});

describe('ApiKeysService.revoke', () => {
  it('чужой ключ по своему id не гасится', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { service } = createService({ updateMany });
    await service.revoke('u1', 'чужой-ключ');
    // Владелец в условии обязателен: иначе знание id гасило бы чужие ключи.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'чужой-ключ', userId: 'u1' } }),
    );
  });
});

describe('ApiKeysService.issue: ключ для ИИ-агента', () => {
  it('обычному человеку агентский ключ не выпускается', async () => {
    // Агент состоит в чужих средах, поэтому ключ на него — доступ к доскам,
    // куда выпускающего никто не звал.
    const { service, create } = createService(
      {},
      { findUnique: agentAccount() },
    );
    await expect(
      service.issue('u1', 'Севак', ['work:write'], null, {
        id: 'sevak',
        issuerRole: 'user',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('админ сервиса тоже не выпускает: его полномочия — свой раздел', async () => {
    const { service, create } = createService(
      {},
      { findUnique: agentAccount() },
    );
    await expect(
      service.issue('u1', 'Севак', ['work:write'], null, {
        id: 'sevak',
        issuerRole: 'service-admin',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('на аккаунт живого человека ключ не выписывается даже администрацией', async () => {
    const { service, create } = createService(
      {},
      { findUnique: agentAccount(false) },
    );
    await expect(
      service.issue('u1', 'под Стаса', ['work:write'], null, {
        id: 'stas',
        issuerRole: 'admin',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('несуществующий аккаунт — отказ, а не ключ в никуда', async () => {
    const { service } = createService();
    await expect(
      service.issue('u1', 'Севак', ['work:write'], null, {
        id: 'нет-такого',
        issuerRole: 'admin',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('у выпущенного ключа владелец — человек, а действующее лицо — агент', async () => {
    const { service, create } = createService(
      {},
      { findUnique: agentAccount() },
    );
    const issued = await service.issue('u1', 'Севак', ['work:write'], null, {
      id: 'sevak',
      issuerRole: 'admin',
    });
    const data = create.mock.calls[0][0].data as {
      userId: string;
      agentId: string | null;
    };
    // Отвечает за ключ тот, кто его выпустил: отзывать и спрашивать — с него.
    expect(data.userId).toBe('u1');
    expect(data.agentId).toBe('sevak');
    expect(issued.agentId).toBe('sevak');
  });

  it('личный ключ остаётся личным: агента в записи нет', async () => {
    const { service, create } = createService();
    const issued = await service.issue('u1', 'Claude', ['work:read'], null);
    const data = create.mock.calls[0][0].data as { agentId: string | null };
    expect(data.agentId).toBeNull();
    expect(issued.agentId).toBeNull();
  });
});

describe('ApiKeysService.list', () => {
  it('имя агента в списке ключей — духовное, как везде на портале', async () => {
    const { service } = createService({
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'k1',
          name: 'Севак на ноутбуке',
          agent: { id: 'sevak', name: 'Sevak', spiritualName: 'Севак' },
        },
      ]),
    });
    const [key] = await service.list('u1');
    expect(key.agent).toEqual({ id: 'sevak', name: 'Севак' });
  });

  it('у личного ключа агента нет', async () => {
    const { service } = createService({
      findMany: jest.fn().mockResolvedValue([{ id: 'k1', agent: null }]),
    });
    const [key] = await service.list('u1');
    expect(key.agent).toBeNull();
  });
});

describe('ApiKeysService.listAgents', () => {
  it('список служебных аккаунтов открыт только администрации', async () => {
    const { service, userFindMany } = createService();
    await expect(service.listAgents('user')).rejects.toThrow(
      ForbiddenException,
    );
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('людей в списке нет — только служебные аккаунты', async () => {
    const { service, userFindMany } = createService();
    await service.listAgents('admin');
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isAgent: true } }),
    );
  });
});
