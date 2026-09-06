import { BadRequestException } from '@nestjs/common';
import { AuthAdminService } from './auth-admin.service';

const row = {
  provider: 'yandex' as const,
  enabled: false,
  domains: ['vedamatch.ru'],
  sortOrder: 1,
  updatedAt: new Date('2026-09-05T00:00:00Z'),
};

function make(overrides: Partial<typeof row> = {}) {
  const current = { ...row, ...overrides };
  const update = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    ...current,
    ...args.data,
  }));
  const prisma = {
    authProviderSetting: {
      findMany: jest.fn().mockResolvedValue([current]),
      findUnique: jest.fn().mockResolvedValue(current),
      update,
    },
  };
  const emit = jest.fn();
  return {
    service: new AuthAdminService(prisma as never, { emit } as never),
    prisma,
    update,
    emit,
  };
}

describe('AuthAdminService', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('не даёт включить способ без ключей', async () => {
    delete process.env.YANDEX_CLIENT_ID;
    delete process.env.YANDEX_CLIENT_SECRET;
    const { service, update } = make();

    await expect(
      service.update('admin-1', 'yandex', { enabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Снаружи это была бы рабочая кнопка, которая у всех падает в 503.
    expect(update).not.toHaveBeenCalled();
  });

  it('выключить можно всегда, даже ненастроенный', async () => {
    delete process.env.YANDEX_CLIENT_ID;
    const { service, update } = make({ enabled: true });

    await service.update('admin-1', 'yandex', { enabled: false });

    expect(update).toHaveBeenCalled();
  });

  it('включает настроенный и пишет в журнал «было → стало»', async () => {
    process.env.YANDEX_CLIENT_ID = 'id';
    process.env.YANDEX_CLIENT_SECRET = 'secret';
    const { service, emit } = make();

    await service.update('admin-1', 'yandex', { enabled: true });

    const [name, event] = emit.mock.calls[0] as [
      string,
      { action: string; details: Record<string, string> },
    ];
    expect(name).toBe('admin.action');
    expect(event.action).toBe('auth.provider-changed');
    // Одного «изменили Яндекс» через месяц не хватит: включили или выключили?
    expect(event.details.enabled).toBe('false → true');
  });

  it('приводит домен к тому виду, с каким сверяется вход', async () => {
    const { service, update } = make();

    await service.update('admin-1', 'yandex', {
      domains: ['https://VedaMatch.ru/login', 'api.vedamatch.ru'],
    });

    // Оба варианта — один и тот же домен портала. Иначе админ впишет адрес с
    // протоколом, способ не покажется нигде, а причина будет невидима.
    expect(update.mock.calls[0][0].data.domains).toEqual(['vedamatch.ru']);
  });

  it('отказывает на непохожем на домен', async () => {
    const { service } = make();

    await expect(
      service.update('admin-1', 'yandex', { domains: ['не домен!'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отрицательный порядок не принимается', async () => {
    const { service } = make();

    await expect(
      service.update('admin-1', 'yandex', { sortOrder: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('в списке видно, настроен ли способ, но не сами ключи', async () => {
    process.env.YANDEX_CLIENT_ID = 'id';
    process.env.YANDEX_CLIENT_SECRET = 'secret';
    const { service } = make();

    const [item] = await service.list();

    expect(item.configured).toBe(true);
    expect(JSON.stringify(item)).not.toContain('secret');
  });
});
