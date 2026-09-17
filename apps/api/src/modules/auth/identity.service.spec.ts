import { PersonalDataService } from '../personal-data/personal-data.service';
import { IdentityService } from './identity.service';

/**
 * Настоящий PersonalDataService над выключенным контуром: для global он
 * прозрачен и сразу зовёт амстердамскую запись. Так тесты проверяют реальный
 * путь, а не заглушку вместо него.
 */
function personal() {
  return new PersonalDataService({} as never, { isEnabled: false } as never);
}

const profile = {
  provider: 'yandex' as const,
  externalId: '42',
  email: 'ivan@example.com',
  name: 'Иван',
};

function prismaMock(overrides: Record<string, unknown> = {}) {
  const merged = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u1', email: profile.email }),
      updateMany: jest.fn(),
    },
    ...overrides,
  } as {
    userIdentity: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
  };

  return {
    ...merged,
    // `unlink()` теперь работает внутри `$transaction` с блокировкой строки
    // `User` (`SELECT ... FOR UPDATE`) — колбэку достаются те же
    // `userIdentity`/`user`, что видит остальной тест через `overrides`, а
    // `$queryRaw` по умолчанию находит пользователя.
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'u1' }]),
        userIdentity: merged.userIdentity,
        user: merged.user,
      }),
    ),
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
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'other', email: profile.email }),
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
        findUnique: jest.fn().mockResolvedValue({
          id: 'i1',
          user: { id: 'u-old', email: profile.email },
        }),
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

  describe('listIdentities', () => {
    it('отмечает canUnlink=false, когда способ входа единственный', async () => {
      const prisma = prismaMock({
        userIdentity: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { provider: 'google', createdAt: new Date(), lastLoginAt: null },
            ]),
        },
      });

      const list = await new IdentityService(prisma, personal()).listIdentities(
        'u1',
      );

      expect(list).toEqual([
        expect.objectContaining({ provider: 'google', canUnlink: false }),
      ]);
    });

    it('canUnlink=true у каждого, когда способов несколько', async () => {
      const prisma = prismaMock({
        userIdentity: {
          findMany: jest.fn().mockResolvedValue([
            { provider: 'google', createdAt: new Date(), lastLoginAt: null },
            { provider: 'telegram', createdAt: new Date(), lastLoginAt: null },
          ]),
        },
      });

      const list = await new IdentityService(prisma, personal()).listIdentities(
        'u1',
      );

      expect(list.every((row) => row.canUnlink)).toBe(true);
    });

    // Раунд оценки вехи 3, п.2: если гонка на отвязке (до фикса) когда-то
    // успела оставить аккаунт без единой идентичности, `GET /auth/identities`
    // не должен падать 500 — пустой список валиден, а не крах.
    it('пустой список (гипотетически уже испорченный аккаунт) — не падает', async () => {
      const prisma = prismaMock({
        userIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        new IdentityService(prisma, personal()).listIdentities('u1'),
      ).resolves.toEqual([]);
    });
  });

  describe('link', () => {
    it('заводит новую идентичность на живой сессии', async () => {
      const create = jest.fn();
      const prisma = prismaMock({
        userIdentity: { findUnique: jest.fn().mockResolvedValue(null), create },
      });

      const result = await new IdentityService(prisma, personal()).link(
        'u1',
        'google',
        'g-42',
      );

      expect(result).toBe('created');
      expect(create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          provider: 'google',
          externalId: 'g-42',
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it('повторная привязка своего же способа — no-op, без дубля', async () => {
      const create = jest.fn();
      const update = jest.fn();
      const prisma = prismaMock({
        userIdentity: {
          findUnique: jest.fn().mockResolvedValue({ id: 'i1', userId: 'u1' }),
          create,
          update,
        },
      });

      const result = await new IdentityService(prisma, personal()).link(
        'u1',
        'google',
        'g-42',
      );

      expect(result).toBe('noop');
      expect(create).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('способ уже привязан к другому — отказ, аккаунт не трогается', async () => {
      const create = jest.fn();
      const prisma = prismaMock({
        userIdentity: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'i1', userId: 'other' }),
          create,
        },
      });

      await expect(
        new IdentityService(prisma, personal()).link('u1', 'google', 'g-42'),
      ).rejects.toThrow(/уже привязан к другому аккаунту/);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('последний способ входа отвязать нельзя', async () => {
      const del = jest.fn();
      const prisma = prismaMock({
        userIdentity: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'i1', provider: 'google' }]),
          delete: del,
        },
      });

      await expect(
        new IdentityService(prisma, personal()).unlink('u1', 'google'),
      ).rejects.toThrow(/последний способ входа/);
      expect(del).not.toHaveBeenCalled();
    });

    it('отвязывает google и гасит устаревшую колонку googleId', async () => {
      const del = jest.fn();
      const updateMany = jest.fn();
      const prisma = prismaMock({
        userIdentity: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'i1', provider: 'google' },
            { id: 'i2', provider: 'telegram' },
          ]),
          delete: del,
        },
        user: { updateMany },
      });

      await new IdentityService(prisma, personal()).unlink('u1', 'google');

      expect(del).toHaveBeenCalledWith({ where: { id: 'i1' } });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', googleId: { not: null } },
        data: { googleId: null },
      });
    });

    it('способ, который не привязан, — 404', async () => {
      const prisma = prismaMock({
        userIdentity: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'i1', provider: 'google' },
            { id: 'i2', provider: 'telegram' },
          ]),
        },
      });

      await expect(
        new IdentityService(prisma, personal()).unlink('u1', 'yandex'),
      ).rejects.toThrow(/не привязан/);
    });
  });

  describe('unlink — гонка параллельных отвязок (раунд оценки вехи 3, блокирующий п.1)', () => {
    /**
     * Эмулирует блокировку строки `User` внутри `$transaction`
     * (`SELECT ... FOR UPDATE`): вторая транзакция того же пользователя не
     * начинает колбэк, пока не завершилась («не закоммитилась») первая —
     * ровно то, что даёт реальный Postgres блокировкой строки. Общее
     * состояние — один и тот же массив идентичностей, который читают и
     * мутируют оба вызова через `tx`.
     */
    function racyPrisma(initial: { id: string; provider: string }[]) {
      let queue: Promise<unknown> = Promise.resolve();
      const state = { identities: [...initial] };
      const updateManyUser = jest.fn().mockResolvedValue({ count: 0 });

      const prisma = {
        $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
          const run = queue.then(() =>
            callback({
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'u1' }]),
              userIdentity: {
                findMany: jest
                  .fn()
                  .mockImplementation(() =>
                    Promise.resolve([...state.identities]),
                  ),
                delete: jest
                  .fn()
                  .mockImplementation(
                    ({ where: { id } }: { where: { id: string } }) => {
                      state.identities = state.identities.filter(
                        (row) => row.id !== id,
                      );
                      return Promise.resolve({});
                    },
                  ),
              },
              user: { updateMany: updateManyUser },
            }),
          );
          // Следующая транзакция ждёт эту — успешную или упавшую, как ждала
          // бы снятия блокировки реальным Postgres.
          queue = run.catch(() => undefined);
          return run;
        }),
      };
      return { prisma, state };
    }

    it('два параллельных DELETE разных провайдеров: проходит ровно один, второй видит актуальное состояние', async () => {
      const { prisma, state } = racyPrisma([
        { id: 'i-google', provider: 'google' },
        { id: 'i-telegram', provider: 'telegram' },
      ]);
      const service = new IdentityService(prisma as never, personal());

      // Тот же порядок вызовов, что и у Promise.all в контроллере: оба
      // unlink() стартуют синхронно, до первого await внутри них —
      // service.unlink('u1', 'google') первым достигает $transaction.
      const results = await Promise.allSettled([
        service.unlink('u1', 'google'),
        service.unlink('u1', 'telegram'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      // Старый баг: оба читали rows.length=2 до коммита первого и оба
      // проходили guard — оба разрешались успехом, 0 идентичностей.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({
        message: expect.stringContaining('последний способ входа'),
      });
      // Аккаунт не остаётся без единого способа входа.
      expect(state.identities).toHaveLength(1);
    });
  });
});
