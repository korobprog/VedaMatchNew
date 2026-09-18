import { classifyManifestResponse, fetchAppManifest, MANIFEST_TIMEOUT_MS, manifestUrl } from './self-update-client';

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
  const variant = { downloadBaseUrl: S3, contour: 'ru' as const, channel: 'site' as const };

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
