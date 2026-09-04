import { PersonalDataService } from '../personal-data/personal-data.service';
import { IdentityService } from './identity.service';

/**
 * Настоящий PersonalDataService над выключенным контуром: для global он
 * прозрачен и сразу зовёт амстердамскую запись. Так тесты проверяют реальный
 * путь, а не заглушку вместо него.
 */
function personal() {
  return new PersonalDataService({ isEnabled: false } as never);
}

const profile = {
  provider: 'yandex' as const,
  externalId: '42',
  email: 'ivan@example.com',
  name: 'Иван',
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
    const service = new IdentityService(prisma, personal());

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
    const service = new IdentityService(prisma, personal());

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
    const service = new IdentityService(prisma, personal());

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
  it('без заявления резидентность ru: сомнение — в пользу России', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1' });
    const prisma = prismaMock({
      user: { findUnique: jest.fn().mockResolvedValue(null), create },
    });

    await new IdentityService(prisma, personal()).resolve(profile);

    // Проверяется аргумент, а не возврат: признак невосстановим задним числом
    // у входа по почте, и потерять его в момент создания нельзя.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataResidency: 'ru' }),
      }),
    );
  });

  it('заявленная резидентность побеждает умолчание', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u2' });
    const prisma = prismaMock({
      user: { findUnique: jest.fn().mockResolvedValue(null), create },
    });

    await new IdentityService(prisma, personal()).resolve({
      ...profile,
      provider: 'google',
      externalId: 'g-1',
      declaredResidency: 'global' as const,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataResidency: 'global' }),
      }),
    );
  });
});
