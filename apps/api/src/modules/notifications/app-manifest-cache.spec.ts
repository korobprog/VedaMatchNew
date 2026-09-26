import {
  classifyStorageResponse,
  createManifestCache,
  MANIFEST_CACHE_TTL_MS,
  MANIFEST_FAILURE_TTL_MS,
  type ManifestOutcome,
} from './app-manifest-cache';

const manifest = {
  versionName: '1.4.0+abc1234',
  versionCode: 1031,
  sizeBytes: 50_000_000,
  sha256: 'a'.repeat(64),
  url: 'https://media.vedamatch.ru/bucket/mobile/android/ru-site/vedamatch-1.4.0-1031.apk',
  commit: 'abc1234',
  builtAt: '2026-09-24T08:00:00.000Z',
  minAndroid: '7.0',
};

describe('classifyStorageResponse', () => {
  it('манифест отдаётся как есть, со всеми полями', () => {
    expect(classifyStorageResponse(200, manifest)).toEqual({
      kind: 'ok',
      manifest,
    });
  });

  it('403/404/410 — не опубликован (публичный бакет на пропавший ключ отвечает 403)', () => {
    for (const status of [403, 404, 410])
      expect(classifyStorageResponse(status, undefined)).toEqual({
        kind: 'not-found',
      });
  });

  it('5xx и прочие не-2xx — недоступно', () => {
    expect(classifyStorageResponse(502, undefined).kind).toBe('unavailable');
    expect(classifyStorageResponse(301, undefined).kind).toBe('unavailable');
  });

  it('200 не с манифестом — недоступно, а не «вот он»', () => {
    expect(classifyStorageResponse(200, undefined).kind).toBe('unavailable');
    expect(classifyStorageResponse(200, [manifest]).kind).toBe('unavailable');
    expect(
      classifyStorageResponse(200, { ...manifest, versionCode: 'x' }).kind,
    ).toBe('unavailable');
  });
});

describe('createManifestCache', () => {
  const ok: ManifestOutcome = { kind: 'ok', manifest };
  const down: ManifestOutcome = { kind: 'unavailable', reason: 'timeout' };

  function setup(outcomes: ManifestOutcome[]) {
    let clock = 0;
    const load = jest.fn(() => Promise.resolve(outcomes.shift() ?? ok));
    const cache = createManifestCache({ load, now: () => clock });
    return {
      cache,
      load,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it('свежий манифест — из памяти, хранилище не трогается', async () => {
    const { cache, load, advance } = setup([ok]);
    await expect(cache.get('ru-site')).resolves.toEqual(ok);
    advance(MANIFEST_CACHE_TTL_MS - 1);
    await expect(cache.get('ru-site')).resolves.toEqual(ok);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('через минуту перечитывает', async () => {
    const { cache, load, advance } = setup([ok, ok]);
    await cache.get('ru-site');
    advance(MANIFEST_CACHE_TTL_MS);
    await cache.get('ru-site');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('одновременные запросы делят одно чтение', async () => {
    let release!: (outcome: ManifestOutcome) => void;
    const load = jest.fn(
      () =>
        new Promise<ManifestOutcome>((resolve) => {
          release = resolve;
        }),
    );
    const cache = createManifestCache({ load, now: () => 0 });
    const all = Promise.all([cache.get('k'), cache.get('k'), cache.get('k')]);
    release(ok);
    await expect(all).resolves.toEqual([ok, ok, ok]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('сбой помнится коротко: не долбим лежащее хранилище, но и не на минуту', async () => {
    const { cache, load, advance } = setup([down, ok]);
    await expect(cache.get('k')).resolves.toEqual(down);
    advance(MANIFEST_FAILURE_TTL_MS - 1);
    await expect(cache.get('k')).resolves.toEqual(down);
    expect(load).toHaveBeenCalledTimes(1);
    advance(1);
    await expect(cache.get('k')).resolves.toEqual(ok);
    expect(MANIFEST_FAILURE_TTL_MS).toBeLessThan(MANIFEST_CACHE_TTL_MS);
  });

  it('разные ключи — разные записи', async () => {
    const { cache, load } = setup([ok, { kind: 'not-found' }]);
    await cache.get('release');
    await expect(cache.get('test')).resolves.toEqual({ kind: 'not-found' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('брошенная загрузчиком ошибка — тот же сбой, не исключение наружу', async () => {
    const cache = createManifestCache({
      load: () => Promise.reject(new Error('ECONNRESET')),
      now: () => 0,
    });
    await expect(cache.get('k')).resolves.toEqual({
      kind: 'unavailable',
      reason: 'ECONNRESET',
    });
  });
});
