import { API_MANIFEST_TIMEOUT_MS } from './manifest-sources';
import {
  classifyManifestResponse,
  combineManifestResults,
  fetchAppManifest,
  MANIFEST_TIMEOUT_MS,
  manifestUrl,
} from './self-update-client';

const S3 = 'https://s3.example.com/bucket-id';

const validManifest = {
  versionName: '0.1.0+a1b2c3d',
  versionCode: 1042,
  sizeBytes: 162_495_135,
  sha256: 'b'.repeat(64),
  url: `${S3}/mobile/android/ru-site/vedamatch-0.1.0-1042.apk`,
  commit: 'a1b2c3d',
  builtAt: '2026-09-18T10:00:00Z',
  minAndroid: '7.0',
};

describe('manifestUrl', () => {
  it('ru + site даёт путь, по которому workflow публикует манифест', () => {
    expect(manifestUrl({ downloadBaseUrl: S3, contour: 'ru', channel: 'site' })).toBe(
      `${S3}/mobile/android/ru-site/latest.json`,
    );
  });

  it('хвостовые слэши в базе не удваиваются', () => {
    expect(manifestUrl({ downloadBaseUrl: `${S3}//`, contour: 'ru', channel: 'site' })).toBe(
      `${S3}/mobile/android/ru-site/latest.json`,
    );
  });

  it('com + site строит свой путь, а не хардкод ru-site', () => {
    expect(manifestUrl({ downloadBaseUrl: S3, contour: 'com', channel: 'site' })).toBe(
      `${S3}/mobile/android/com-site/latest.json`,
    );
  });

  it('тестовая папка в базе сохраняется (стенд проверки самообновления)', () => {
    expect(manifestUrl({ downloadBaseUrl: `${S3}/test`, contour: 'ru', channel: 'site' })).toBe(
      `${S3}/test/mobile/android/ru-site/latest.json`,
    );
  });

  it('адрес раздачи не задан — null, а не адрес сайта', () => {
    expect(manifestUrl({ downloadBaseUrl: null, contour: 'ru', channel: 'site' })).toBeNull();
    expect(manifestUrl({ downloadBaseUrl: '  ', contour: 'ru', channel: 'site' })).toBeNull();
  });
});

describe('classifyManifestResponse', () => {
  it('200 с валидным манифестом — ok с разобранным манифестом', () => {
    expect(classifyManifestResponse(200, JSON.stringify(validManifest))).toEqual({
      kind: 'ok',
      manifest: validManifest,
    });
  });

  it('404, 410 и 403 (публичный S3 без листинга на отсутствующий ключ) — not-found', () => {
    expect(classifyManifestResponse(404, '<Error/>')).toEqual({ kind: 'not-found' });
    expect(classifyManifestResponse(410, '')).toEqual({ kind: 'not-found' });
    expect(classifyManifestResponse(403, '<Error><Code>AccessDenied</Code></Error>')).toEqual({ kind: 'not-found' });
  });

  it('5xx, 408 и 429 — network (временная беда хранилища, стоит повторить)', () => {
    expect(classifyManifestResponse(500, '')).toEqual({ kind: 'network' });
    expect(classifyManifestResponse(503, '')).toEqual({ kind: 'network' });
    expect(classifyManifestResponse(408, '')).toEqual({ kind: 'network' });
    expect(classifyManifestResponse(429, '')).toEqual({ kind: 'network' });
  });

  it('200 с HTML лендинга (итерация 1: редирект proxy.ts на сайт) — malformed', () => {
    expect(classifyManifestResponse(200, '<!DOCTYPE html><html>VedaMatch</html>')).toEqual({ kind: 'malformed' });
  });

  it('200 с JSON, но не манифестом — malformed', () => {
    expect(classifyManifestResponse(200, JSON.stringify({ ...validManifest, sha256: 'xyz' }))).toEqual({
      kind: 'malformed',
    });
    expect(classifyManifestResponse(200, '{}')).toEqual({ kind: 'malformed' });
    expect(classifyManifestResponse(200, '')).toEqual({ kind: 'malformed' });
  });

  it('прочие коды (3xx без перехода, 400) — malformed, не ok', () => {
    expect(classifyManifestResponse(307, JSON.stringify(validManifest))).toEqual({ kind: 'malformed' });
    expect(classifyManifestResponse(400, JSON.stringify(validManifest))).toEqual({ kind: 'malformed' });
  });
});

describe('fetchAppManifest', () => {
  // Только прямой адрес хранилища (`apiOrigin: null`) — то, как проверяли
  // сборки до манифеста через API; порядок источников — ниже и в
  // `manifest-sources.spec.ts`.
  const variant = { apiOrigin: null, downloadBaseUrl: S3, contour: 'ru' as const, channel: 'site' as const };

  function fakeFetch(status: number, body: string) {
    return jest.fn(async () => ({ status, text: async () => body }) as unknown as Response);
  }

  it('без адреса раздачи не ходит в сеть вовсе — not-configured', async () => {
    const fetchImpl = fakeFetch(200, JSON.stringify(validManifest));
    await expect(
      fetchAppManifest({ ...variant, downloadBaseUrl: null }, fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ kind: 'not-configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('запрашивает ровно manifestUrl и классифицирует ответ', async () => {
    const fetchImpl = fakeFetch(200, JSON.stringify(validManifest));
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'ok',
      manifest: validManifest,
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${S3}/mobile/android/ru-site/latest.json`, expect.anything());
  });

  it('fetch бросил (нет сети, DNS, TLS) — network', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'network',
    });
  });

  it('обрыв при чтении тела — network', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          status: 200,
          text: async () => {
            throw new TypeError('body stream interrupted');
          },
        }) as unknown as Response,
    );
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'network',
    });
  });

  it('404 от хранилища — not-found', async () => {
    await expect(
      fetchAppManifest(variant, fakeFetch(404, 'NoSuchKey') as unknown as typeof fetch),
    ).resolves.toEqual({ kind: 'not-found' });
  });

  describe('таймаут', () => {
    /** fetch, который отвечает только на abort — как повисшее соединение. */
    function hangingFetch() {
      return jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      );
    }

    afterEach(() => jest.useRealTimers());

    it('по умолчанию ждёт 15 секунд', () => {
      expect(MANIFEST_TIMEOUT_MS).toBe(15_000);
    });

    it('повисший запрос прерывается по таймауту и даёт network', async () => {
      jest.useFakeTimers();
      const fetchImpl = hangingFetch();
      const run = fetchAppManifest(variant, fetchImpl as unknown as typeof fetch);
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(MANIFEST_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(run).resolves.toEqual({ kind: 'network' });
      const init = fetchImpl.mock.calls[0][1] as RequestInit;
      expect(init.signal?.aborted).toBe(true);
    });

    it('быстрый ответ не прерывается и таймер не остаётся висеть', async () => {
      jest.useFakeTimers();
      const fetchImpl = fakeFetch(200, JSON.stringify(validManifest));
      await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch, 50)).resolves.toMatchObject({
        kind: 'ok',
      });
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

describe('combineManifestResults', () => {
  const ok = { kind: 'ok', manifest: validManifest } as const;

  it('первый манифест побеждает', () => {
    expect(combineManifestResults([{ kind: 'network' }, ok])).toEqual(ok);
  });

  it('без манифеста — «нет связи» важнее «не опубликовано»: кнопка повтора остаётся', () => {
    expect(combineManifestResults([{ kind: 'not-found' }, { kind: 'network' }])).toEqual({ kind: 'network' });
    expect(combineManifestResults([{ kind: 'network' }, { kind: 'not-found' }])).toEqual({ kind: 'network' });
  });

  it('непонятный ответ важнее «не опубликовано»', () => {
    expect(combineManifestResults([{ kind: 'not-found' }, { kind: 'malformed' }])).toEqual({ kind: 'malformed' });
  });

  it('оба «не опубликовано» — не опубликовано', () => {
    expect(combineManifestResults([{ kind: 'not-found' }, { kind: 'not-found' }])).toEqual({ kind: 'not-found' });
  });
});

describe('fetchAppManifest: сначала API, хранилище — запасной путь', () => {
  const API = 'https://api.vedamatch.ru';
  const variant = { apiOrigin: API, downloadBaseUrl: S3, contour: 'ru' as const, channel: 'site' as const };
  const apiUrl = `${API}/notifications/app-release/ru-site/latest.json`;
  const directUrl = `${S3}/mobile/android/ru-site/latest.json`;

  function routedFetch(routes: Record<string, { status: number; body: string } | 'throw'>) {
    return jest.fn(async (url: string) => {
      const route = routes[url];
      if (!route || route === 'throw') throw new TypeError('Network request failed');
      return { status: route.status, text: async () => route.body } as unknown as Response;
    });
  }

  it('API ответил — хранилище не трогаем', async () => {
    const fetchImpl = routedFetch({ [apiUrl]: { status: 200, body: JSON.stringify(validManifest) } });
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'ok',
      manifest: validManifest,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(apiUrl);
  });

  it('API 503 (хранилище за ним не ответило) — идём по зашитому адресу', async () => {
    const fetchImpl = routedFetch({
      [apiUrl]: { status: 503, body: '{"message":"Хранилище обновлений сейчас недоступно"}' },
      [directUrl]: { status: 200, body: JSON.stringify(validManifest) },
    });
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({ kind: 'ok' });
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([apiUrl, directUrl]);
  });

  it('старый сервер без маршрута (404) — тоже запасной путь', async () => {
    const fetchImpl = routedFetch({
      [apiUrl]: { status: 404, body: '{"message":"Cannot GET"}' },
      [directUrl]: { status: 200, body: JSON.stringify(validManifest) },
    });
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({ kind: 'ok' });
  });

  it('API недоступен и хранилище тоже — «нет связи»', async () => {
    const fetchImpl = routedFetch({ [apiUrl]: 'throw', [directUrl]: { status: 404, body: '' } });
    await expect(fetchAppManifest(variant, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ kind: 'network' });
  });

  it('адреса хранилища в сборке нет — спрашиваем только API', async () => {
    const fetchImpl = routedFetch({ [apiUrl]: { status: 200, body: JSON.stringify(validManifest) } });
    await expect(
      fetchAppManifest({ ...variant, downloadBaseUrl: null }, fetchImpl as unknown as typeof fetch),
    ).resolves.toMatchObject({ kind: 'ok' });
  });

  it('повисший API отпускается раньше хранилища, и запасной путь успевает', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn((url: string, init?: RequestInit) =>
        url === apiUrl
          ? new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
            })
          : Promise.resolve({ status: 200, text: async () => JSON.stringify(validManifest) } as unknown as Response),
      );
      const run = fetchAppManifest(variant, fetchImpl as unknown as typeof fetch);
      await jest.advanceTimersByTimeAsync(API_MANIFEST_TIMEOUT_MS);
      await expect(run).resolves.toMatchObject({ kind: 'ok' });
      expect(API_MANIFEST_TIMEOUT_MS).toBeLessThan(MANIFEST_TIMEOUT_MS);
    } finally {
      jest.useRealTimers();
    }
  });
});
