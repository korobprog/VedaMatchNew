import { IdentityService } from './identity.service';

const profile = {
  provider: 'yandex' as const,
  externalId: '42',
  email: 'ivan@example.com',
  name: 'Иван',
  residency: 'ru' as const,
};

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u1', email: profile.email }),
    },
    ...overrides,
  } as never;
}

describe('IdentityService', () => {
  it('заводит пользователя, когда идентичности нет', async () => {
    const prisma = prismaMock();
    const service = new IdentityService(prisma);

    const { created } = await service.resolve(profile);

    expect(created).toBe(true);
  });

  it('не связывает аккаунты по совпадению почты', async () => {
    const prisma = prismaMock({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'other', email: profile.email }),
        create: jest.fn(),
      },
    });
    const service = new IdentityService(prisma);

    await expect(service.resolve(profile)).rejects.toThrow(/уже используется/);
  });
  it('отдаёт прежний аккаунт, когда идентичность уже есть', async () => {
    const update = jest.fn();
    const create = jest.fn();
    const prisma = prismaMock({
      userIdentity: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'i1', user: { id: 'u-old', email: profile.email } }),
        create,
        update,
      },
    });
    const service = new IdentityService(prisma);

    const { user, created } = await service.resolve(profile);

    expect(created).toBe(false);
    expect(user.id).toBe('u-old');
    // Перенесённым 107 аккаунтам нельзя заводить дубль: create не трогаем,
    // а lastLoginAt обновляем.
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });
});
