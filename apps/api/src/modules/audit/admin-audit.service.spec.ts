import { AdminAuditService, buildWhere } from './admin-audit.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const prisma = {
    adminAuditEntry: {
      create: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
  };
  return {
    prisma,
    service: new AdminAuditService(prisma as unknown as PrismaService),
  };
}

/** expect.objectContaining типизирован как `any`; оборачиваем в одном месте. */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

describe('AdminAuditService.record', () => {
  it('пишет известное действие', async () => {
    const { service, prisma } = createService();

    await service.record({
      actorId: 'admin-1',
      action: 'user.blocked',
      targetType: 'user',
      targetId: 'u-1',
      details: { reason: 'спам' },
    });

    expect(prisma.adminAuditEntry.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'user.blocked',
        targetType: 'user',
        targetId: 'u-1',
        details: { reason: 'спам' },
      },
    });
  });

  it('чужое действие в базу не попадает', async () => {
    const { service, prisma } = createService();

    await service.record({
      actorId: 'admin-1',
      action: 'user.something' as never,
      targetType: 'user',
    });

    expect(prisma.adminAuditEntry.create).not.toHaveBeenCalled();
  });

  it('без targetId пишет null: действие может быть над всем порталом', async () => {
    const { service, prisma } = createService();

    await service.record({
      actorId: 'admin-1',
      action: 'billing.mode-changed',
      targetType: 'platform',
    });

    expect(prisma.adminAuditEntry.create).toHaveBeenCalledWith({
      data: containing({ targetId: null, details: {} }),
    });
  });

  it('падение записи не срывает само действие', async () => {
    const { service, prisma } = createService();
    prisma.adminAuditEntry.create.mockRejectedValue(new Error('db'));

    await expect(
      service.record({
        actorId: 'admin-1',
        action: 'user.blocked',
        targetType: 'user',
        targetId: 'u-1',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('buildWhere', () => {
  it('пустой запрос не фильтрует', () => {
    expect(buildWhere({})).toEqual({});
  });

  it('фильтрует по автору, объекту и действию', () => {
    expect(
      buildWhere({
        action: 'user.blocked',
        actorId: 'admin-1',
        targetId: 'u-1',
      }),
    ).toEqual({
      action: 'user.blocked',
      actorId: 'admin-1',
      targetId: 'u-1',
    });
  });

  it('неизвестное действие игнорирует, а не отдаёт пустой список', () => {
    expect(buildWhere({ action: 'nope' as never })).toEqual({});
  });

  it('разбирает дату начала периода', () => {
    expect(buildWhere({ since: '2026-08-01T00:00:00.000Z' })).toEqual({
      createdAt: { gte: new Date('2026-08-01T00:00:00.000Z') },
    });
  });

  it('мусор вместо даты не ломает выборку', () => {
    expect(buildWhere({ since: 'вчера' })).toEqual({});
  });
});
