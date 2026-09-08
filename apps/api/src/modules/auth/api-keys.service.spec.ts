import { ForbiddenException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const update = jest.fn().mockResolvedValue({});
  const count = jest.fn().mockResolvedValue(0);
  const create = jest.fn().mockResolvedValue({ id: 'k1' });
  const prisma = {
    userApiKey: { findMany, update, count, create, ...overrides },
  } as unknown as PrismaService;
  return {
    service: new ApiKeysService(prisma),
    findMany,
    update,
    count,
    create,
  };
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
