import { PersonalDataService } from '../personal-data/personal-data.service';
import { Prisma } from '@prisma/client';
import {
  ANONYMIZE_GRACE_MS,
  ANONYMIZED_EMAIL_PREFIX,
  ANONYMIZED_NAME,
  AccountAnonymizeService,
  anonymizedEmail,
  isAnonymizedEmail,
} from './account-anonymize.service';

function makePrisma(
  candidates: Array<{ id: string; avatarKey: string | null }>,
) {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(candidates),
      update: jest.fn((args: unknown) => ({ op: 'user.update', args })),
    },
    userPhoto: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ storageKey: 'users/u1/gallery/a.webp' }]),
      deleteMany: jest.fn((args: unknown) => ({
        op: 'userPhoto.deleteMany',
        args,
      })),
    },
    astroBirthData: {
      deleteMany: jest.fn((args: unknown) => ({
        op: 'astro.deleteMany',
        args,
      })),
    },
    refreshToken: {
      updateMany: jest.fn((args: unknown) => ({
        op: 'refresh.updateMany',
        args,
      })),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return prisma;
}

describe('AccountAnonymizeService', () => {
  const now = new Date('2026-08-19T12:00:00Z');

  it('email-маркер: генерируется по id и распознаётся', () => {
    expect(anonymizedEmail('abc')).toBe('deleted+abc@anonymized.invalid');
    expect(isAnonymizedEmail(anonymizedEmail('abc'))).toBe(true);
    expect(isAnonymizedEmail('user@example.com')).toBe(false);
  });

  it('выбирает удалённых после grace-периода и ещё не анонимизированных', async () => {
    const prisma = makePrisma([]);
    const gallery = { removeStorageObjects: jest.fn() };
    const service = new AccountAnonymizeService(
      prisma as never,
      gallery as never,
      new PersonalDataService(prisma as never, { isEnabled: false } as never),
    );

    await expect(service.tick(now)).resolves.toEqual({
      anonymized: 0,
      storageObjects: 0,
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountStatus: 'deleted',
          deletedAt: { lt: new Date(now.getTime() - ANONYMIZE_GRACE_MS) },
          NOT: { email: { startsWith: ANONYMIZED_EMAIL_PREFIX } },
        },
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('затирает PII в транзакции, отзывает токены и чистит хранилище', async () => {
    const prisma = makePrisma([
      { id: 'u1', avatarKey: 'users/u1/avatar.webp' },
    ]);
    const gallery = {
      removeStorageObjects: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountAnonymizeService(
      prisma as never,
      gallery as never,
      new PersonalDataService(prisma as never, { isEnabled: false } as never),
    );

    await expect(service.tick(now)).resolves.toEqual({
      anonymized: 1,
      storageObjects: 2,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{
      op: string;
      args: unknown;
    }>;
    expect(ops.map((o) => o.op)).toEqual([
      'refresh.updateMany',
      'userPhoto.deleteMany',
      'astro.deleteMany',
      'user.update',
    ]);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.userPhoto.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        email: 'deleted+u1@anonymized.invalid',
        googleId: null,
        passwordHash: null,
        name: ANONYMIZED_NAME,
        spiritualName: null,
        birthDate: null,
        gender: null,
        homeLocation: Prisma.DbNull,
        socialLinks: Prisma.DbNull,
        messengers: Prisma.DbNull,
        avatarUrl: null,
        avatarKey: null,
        statusActor: 'system',
      }),
    });
    // lastSeenAt / deletedAt / accountStatus не трогаем
    const { data } = prisma.user.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty('lastSeenAt');
    expect(data).not.toHaveProperty('accountStatus');
    expect(data).not.toHaveProperty('deletedAt');

    expect(gallery.removeStorageObjects).toHaveBeenCalledWith(
      ['users/u1/avatar.webp', 'users/u1/gallery/a.webp'],
      expect.any(String),
    );
  });

  it('ошибка одного аккаунта не роняет тик и не мешает остальным', async () => {
    const prisma = makePrisma([
      { id: 'bad', avatarKey: null },
      { id: 'ok', avatarKey: null },
    ]);
    prisma.$transaction
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce([]);
    const gallery = {
      removeStorageObjects: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountAnonymizeService(
      prisma as never,
      gallery as never,
      new PersonalDataService(prisma as never, { isEnabled: false } as never),
    );

    await expect(service.tick(now)).resolves.toEqual({
      anonymized: 1,
      storageObjects: 1,
    });
  });

  it('ошибка выборки не роняет тик', async () => {
    const prisma = makePrisma([]);
    prisma.user.findMany.mockRejectedValue(new Error('db'));
    const service = new AccountAnonymizeService(
      prisma as never,
      { removeStorageObjects: jest.fn() } as never,
      new PersonalDataService(prisma as never, { isEnabled: false } as never),
    );
    await expect(service.tick(now)).resolves.toEqual({
      anonymized: 0,
      storageObjects: 0,
    });
  });
});
