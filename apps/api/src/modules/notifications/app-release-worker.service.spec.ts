import type { PrismaService } from '../../prisma/prisma.service';
import { AppReleaseWorkerService } from './app-release-worker.service';

/** 12:00 по Москве — окно пушей открыто. */
const NOON = new Date('2026-09-24T09:00:00Z');
/** 03:00 по Москве. */
const NIGHT = new Date('2026-09-24T00:00:00Z');

const manifest = {
  versionName: '1.4.0+abc1234',
  versionCode: 1031,
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
  url: 'https://s3/x.apk',
  commit: 'abc',
  builtAt: '2026-09-24T08:00:00.000Z',
  minAndroid: '7.0',
  notes: 'Голосовые',
};

type Device = {
  id: string;
  token: string;
  appVariant: string | null;
  appVersionCode: number | null;
  updatePromptedCode: number | null;
  createdAt: Date;
  lastSuccessAt: null;
  failureCount: number;
  lastSeenAt: null;
  deadSince: null;
  user: {
    timeZone: string | null;
    notificationPreference: { enabled: boolean; announcements: boolean } | null;
  };
};

function device(id: string, patch: Partial<Device> = {}): Device {
  return {
    id,
    token: `token-${id}`,
    appVariant: 'ru-site',
    appVersionCode: 1030,
    updatePromptedCode: null,
    createdAt: new Date(0),
    lastSuccessAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
    user: { timeZone: 'Europe/Moscow', notificationPreference: null },
    ...patch,
  };
}

function makeDeps(options: { known?: number | null; existing?: { status: string } | null } = {}) {
  const releases: Record<string, unknown>[] = [];
  const prisma = {
    notificationAppRelease: {
      findUnique: jest.fn().mockResolvedValue(
        options.existing
          ? { ...options.existing, versionCode: 1031, versionName: '1.4.0+abc1234' }
          : null,
      ),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { versionCode: options.known ?? null } }),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        releases.push(args.data);
        return Promise.resolve({
          status: args.data.status,
          versionCode: args.data.versionCode,
          versionName: args.data.versionName,
        });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notificationDevice: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const events = { emitAsync: jest.fn().mockResolvedValue([true]) };
  const fcm = { configured: true, send: jest.fn().mockResolvedValue(null) };
  const notifications = { recordDeviceResult: jest.fn() };
  const config = {
    get: jest.fn((key: string) =>
      key === 'S3_PUBLIC_URL' ? 'https://s3.example/bucket' : undefined,
    ),
  };
  const worker = new AppReleaseWorkerService(
    prisma as unknown as PrismaService,
    events as never,
    fcm as never,
    notifications as never,
    config as never,
  );
  return { prisma, events, fcm, notifications, worker, releases };
}

function mockFetch(response: { ok: boolean; status?: number; body?: unknown } | Error) {
  const fetchMock = jest.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve({
          ok: response.ok,
          status: response.status ?? 200,
          json: () => Promise.resolve(response.body),
        }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('AppReleaseWorkerService — как сервер узнаёт о выпуске', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('читает манифест ru-site из публичной раздачи S3', async () => {
    const fetchMock = mockFetch({ ok: true, body: manifest });
    const { worker } = makeDeps();

    await worker.tick(NOON);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://s3.example/bucket/mobile/android/ru-site/latest.json',
      expect.anything(),
    );
  });

  it('первое чтение — исходная версия: ни поста, ни пушей', async () => {
    mockFetch({ ok: true, body: manifest });
    const { worker, releases, events, prisma } = makeDeps({ known: null });

    await worker.tick(NOON);

    expect(releases[0]).toMatchObject({ versionCode: 1031, status: 'baseline' });
    expect(events.emitAsync).not.toHaveBeenCalled();
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });

  it('номер больше известного — новая версия с заметкой из манифеста', async () => {
    mockFetch({ ok: true, body: manifest });
    const { worker, releases } = makeDeps({ known: 1030 });

    await worker.tick(NOON);

    expect(releases[0]).toMatchObject({
      variant: 'ru-site',
      versionCode: 1031,
      versionName: '1.4.0+abc1234',
      notes: 'Голосовые',
      status: 'pending',
    });
  });

  it('уже известная версия второй раз не заводится', async () => {
    mockFetch({ ok: true, body: manifest });
    const { worker, prisma } = makeDeps({ existing: { status: 'announced' } });

    await worker.tick(NOON);

    expect(prisma.notificationAppRelease.create).not.toHaveBeenCalled();
  });

  it.each([
    ['сеть', new Error('ECONNRESET')],
    ['404', { ok: false, status: 404 }],
    ['мусор вместо манифеста', { ok: true, body: '<html>' }],
  ])('манифест не прочитан (%s) — ни записей, ни пушей', async (_label, response) => {
    mockFetch(response as never);
    const { worker, prisma, fcm } = makeDeps({ known: 1030 });

    await worker.tick(NOON);

    expect(prisma.notificationAppRelease.create).not.toHaveBeenCalled();
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('без адреса раздачи воркер ничего не читает', async () => {
    const fetchMock = mockFetch({ ok: true, body: manifest });
    const deps = makeDeps();
    deps.worker = new AppReleaseWorkerService(
      deps.prisma as unknown as PrismaService,
      deps.events as never,
      deps.fcm as never,
      deps.notifications as never,
      { get: () => undefined } as never,
    );

    await deps.worker.tick(NOON);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AppReleaseWorkerService — объявление в канал', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const pending = {
    id: 'r1',
    variant: 'ru-site',
    versionCode: 1031,
    versionName: '1.4.0+abc1234',
    notes: 'Голосовые',
    builtAt: new Date('2026-09-24T08:00:00Z'),
    attemptCount: 0,
  };

  it('новая версия уходит событием на шину и помечается объявленной', async () => {
    mockFetch(new Error('offline'));
    const { worker, prisma, events } = makeDeps();
    prisma.notificationAppRelease.findMany.mockResolvedValue([pending]);

    await worker.tick(NOON);

    expect(events.emitAsync).toHaveBeenCalledWith('app.release.published', {
      variant: 'ru-site',
      versionCode: 1031,
      versionName: '1.4.0+abc1234',
      notes: 'Голосовые',
      path: '/app',
      builtAt: '2026-09-24T08:00:00.000Z',
    });
    expect(prisma.notificationAppRelease.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'announced', announcedAt: NOON, errorMessage: null },
    });
  });

  it('клейм не прошёл (объявляет другой процесс) — второго события нет', async () => {
    mockFetch(new Error('offline'));
    const { worker, prisma, events } = makeDeps();
    prisma.notificationAppRelease.findMany.mockResolvedValue([pending]);
    prisma.notificationAppRelease.updateMany.mockImplementation(
      (args: { data: { status?: string } }) =>
        Promise.resolve({ count: args.data.status === 'announcing' ? 0 : 0 }),
    );

    await worker.tick(NOON);

    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('подписчик ответил «нет» — выпуск вернётся в очередь', async () => {
    mockFetch(new Error('offline'));
    const { worker, prisma, events } = makeDeps();
    prisma.notificationAppRelease.findMany.mockResolvedValue([pending]);
    events.emitAsync.mockResolvedValue([false]);

    await worker.tick(NOON);

    expect(prisma.notificationAppRelease.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'pending', errorMessage: 'подписчик ответил отказом' },
    });
  });

  it('третья неудача — failed, без вечного круга', async () => {
    mockFetch(new Error('offline'));
    const { worker, prisma, events } = makeDeps();
    prisma.notificationAppRelease.findMany.mockResolvedValue([
      { ...pending, attemptCount: 2 },
    ]);
    events.emitAsync.mockRejectedValue(new Error('boom'));

    await worker.tick(NOON);

    expect(prisma.notificationAppRelease.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'failed', errorMessage: 'boom' },
    });
  });
});

describe('AppReleaseWorkerService — пуш «обновите»', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function withRelease(status = 'announced') {
    mockFetch({ ok: true, body: manifest });
    return makeDeps({ existing: { status } });
  }

  it('выборка — только ru-site, отставшие и ещё не позванные об этом выпуске', async () => {
    const { worker, prisma } = withRelease();

    await worker.tick(NOON);

    const where = (
      prisma.notificationDevice.findMany.mock.calls[0] as [{ where: unknown }]
    )[0].where;
    expect(where).toMatchObject({
      provider: 'fcm',
      appVariant: 'ru-site',
      deadSince: null,
      OR: [{ appVersionCode: null }, { appVersionCode: { lt: 1031 } }],
      AND: [
        {
          OR: [
            { updatePromptedCode: null },
            { updatePromptedCode: { lt: 1031 } },
          ],
        },
      ],
      user: { deletedAt: null, accountStatus: 'active' },
    });
  });

  it('отставшему телефону днём — один пуш с отметкой до отправки', async () => {
    const { worker, prisma, fcm, notifications } = withRelease();
    prisma.notificationDevice.findMany.mockResolvedValueOnce([device('d1')]);

    await worker.tick(NOON);

    expect(prisma.notificationDevice.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'd1',
        OR: [{ updatePromptedCode: null }, { updatePromptedCode: { lt: 1031 } }],
      },
      data: { updatePromptedCode: 1031 },
    });
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(fcm.send).toHaveBeenCalledWith('token-d1', {
      title: 'Доступна новая версия VedaMatch',
      body: 'Вышла версия 1.4.0 (сборка 1031). Обновите приложение — это займёт минуту.',
      url: '/app',
      tag: 'app-update-ru-site-1031',
    });
    expect(notifications.recordDeviceResult).toHaveBeenCalled();
  });

  it('магазинная и обновлённая сборки не получают пуш, даже попав в выборку', async () => {
    const { worker, prisma, fcm } = withRelease();
    prisma.notificationDevice.findMany.mockResolvedValueOnce([
      device('store', { appVariant: 'ru-store' }),
      device('fresh', { appVersionCode: 1031 }),
    ]);

    await worker.tick(NOON);

    expect(fcm.send).not.toHaveBeenCalled();
    expect(prisma.notificationDevice.updateMany).not.toHaveBeenCalled();
  });

  it('ночью не шлём и не отмечаем — телефон дождётся утра', async () => {
    mockFetch({ ok: true, body: manifest });
    const { worker, prisma, fcm } = makeDeps({ existing: { status: 'announced' } });
    prisma.notificationDevice.findMany.mockResolvedValueOnce([device('d1')]);

    await worker.tick(NIGHT);

    expect(fcm.send).not.toHaveBeenCalled();
    expect(prisma.notificationDevice.updateMany).not.toHaveBeenCalled();
  });

  it('выключенные новости — отметка без пуша: об этом выпуске больше не спрашиваем', async () => {
    const { worker, prisma, fcm } = withRelease();
    prisma.notificationDevice.findMany.mockResolvedValueOnce([
      device('d1', {
        user: {
          timeZone: null,
          notificationPreference: { enabled: true, announcements: false },
        },
      }),
    ]);

    await worker.tick(NOON);

    expect(prisma.notificationDevice.updateMany).toHaveBeenCalledTimes(1);
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('телефон уже взял другой процесс — второго пуша нет', async () => {
    const { worker, prisma, fcm } = withRelease();
    prisma.notificationDevice.findMany.mockResolvedValueOnce([device('d1')]);
    prisma.notificationDevice.updateMany.mockResolvedValue({ count: 0 });

    await worker.tick(NOON);

    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('исходную версию (застал при выкатке) не пушим', async () => {
    const { worker, prisma } = withRelease('baseline');

    await worker.tick(NOON);

    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });

  it('пуш не зависит от поста: объявление не удалось, а позвать всё равно зовём', async () => {
    const { worker, prisma, fcm } = withRelease('failed');
    prisma.notificationDevice.findMany.mockResolvedValueOnce([device('d1')]);

    await worker.tick(NOON);

    expect(fcm.send).toHaveBeenCalledTimes(1);
  });

  it('без ключа FCM никого не отмечаем — после починки о выпуске узнают', async () => {
    const { worker, prisma, fcm } = withRelease();
    fcm.configured = false;
    prisma.notificationDevice.findMany.mockResolvedValueOnce([device('d1')]);

    await worker.tick(NOON);

    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
    expect(prisma.notificationDevice.updateMany).not.toHaveBeenCalled();
  });

  it('обход идёт курсором: полная пачка ночных телефонов не загораживает остальных', async () => {
    const { worker, prisma, fcm } = withRelease();
    const nightOwls = Array.from({ length: 200 }, (_, i) =>
      device(`n${String(i).padStart(3, '0')}`, {
        user: { timeZone: 'Asia/Vladivostok', notificationPreference: null },
      }),
    );
    prisma.notificationDevice.findMany
      .mockResolvedValueOnce(nightOwls)
      .mockResolvedValueOnce([device('z1')]);

    // 12:00 UTC: 15:00 по Москве, 22:00 во Владивостоке.
    await worker.tick(new Date('2026-09-24T12:00:00Z'));

    const second = (
      prisma.notificationDevice.findMany.mock.calls[1] as [
        { where: { id?: unknown } },
      ]
    )[0].where;
    expect(second.id).toEqual({ gt: 'n199' });
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(fcm.send.mock.calls[0][0]).toBe('token-z1');
  });
});
