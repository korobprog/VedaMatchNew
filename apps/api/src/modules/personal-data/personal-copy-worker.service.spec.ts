import {
  COPY_MAX_ATTEMPTS,
  COPY_STUCK_MS,
  PersonalCopyWorkerService,
} from './personal-copy-worker.service';

const moscowRecord = {
  id: 'u1',
  email: 'ivan@yandex.ru',
  name: 'Иван',
  spiritualName: null,
  birthDate: null,
  gender: 'male',
  avatarKey: null,
  photoKeys: [],
  copiedAt: null,
  copyStartedAt: null,
  copyAttempts: 0,
  birth: null,
};

function make(options: { record?: unknown; amsterdamUserExists?: boolean } = {}) {
  const record = options.record === undefined ? moscowRecord : options.record;
  const calls: string[] = [];

  const personalRecord = {
    findFirst: jest.fn(async (args: unknown) => {
      calls.push('поиск');
      (findArgs as unknown[]).push(args);
      return record;
    }),
    updateMany: jest.fn(async (args: { data?: Record<string, unknown> }) => {
      calls.push(args.data?.copiedAt ? 'закрыт' : 'клейм');
      return { count: 1 };
    }),
    update: jest.fn(async () => {
      calls.push('закрыт');
    }),
  };
  const findArgs: unknown[] = [];

  const ru = {
    isEnabled: true,
    get db() {
      return { personalRecord };
    },
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          (options.amsterdamUserExists ?? true) ? { id: 'u1' } : null,
        ),
      update: jest.fn(async () => {
        calls.push('амстердам');
      }),
    },
    astroBirthData: { upsert: jest.fn() },
  };

  const service = new PersonalCopyWorkerService(
    prisma as never,
    ru as never,
    { get: () => undefined } as never,
  );
  return { service, prisma, personalRecord, calls, findArgs };
}

describe('PersonalCopyWorkerService', () => {
  it('клеймит запись перед отправкой и закрывает после', async () => {
    const { service, calls } = make();

    await service.tick();

    // Клейм раньше записи: иначе две реплики возьмут одну и ту же запись.
    expect(calls).toEqual(['поиск', 'клейм', 'амстердам', 'закрыт']);
  });

  it('берёт только незакрытые и не превысившие предел попыток', async () => {
    const { service, findArgs } = make();

    await service.tick();

    const where = (findArgs[0] as { where: Record<string, unknown> }).where;
    expect(where.copiedAt).toBeNull();
    expect(where.copyAttempts).toEqual({ lt: COPY_MAX_ATTEMPTS });
  });

  it('подбирает зависшие: клейм старше окна не держит запись вечно', async () => {
    const { service, findArgs } = make();

    await service.tick();

    const where = (findArgs[0] as { where: { OR: unknown[] } }).where;
    // Реплика могла умереть после клейма — иначе запись осталась бы навсегда.
    expect(where.OR).toHaveLength(2);
    const stale = where.OR[1] as { copyStartedAt: { lt: Date } };
    expect(Date.now() - stale.copyStartedAt.lt.getTime()).toBeGreaterThanOrEqual(
      COPY_STUCK_MS - 1000,
    );
  });

  it('не воскрешает удалённого: без аккаунта в Амстердаме не пишет', async () => {
    const { service, prisma, calls } = make({ amsterdamUserExists: false });

    await service.tick();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(calls).not.toContain('амстердам');
  });

  it('пустая очередь — тик молча заканчивается', async () => {
    const { service, calls } = make({ record: null });

    await service.tick();

    expect(calls).toEqual(['поиск']);
  });

  it('выключенный контур не запускает досылку вовсе', async () => {
    const { service, personalRecord } = make();
    Object.defineProperty(service, 'ru', {
      value: { isEnabled: false },
      writable: true,
    });

    await service.tick();

    expect(personalRecord.findFirst).not.toHaveBeenCalled();
  });
});
