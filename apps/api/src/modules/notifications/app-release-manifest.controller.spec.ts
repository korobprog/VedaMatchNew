import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppManifestService } from './app-manifest.service';
import { AppReleaseManifestController } from './app-release-manifest.controller';

/**
 * Манифест самообновления через API — настоящей маршрутизацией: запрос
 * уходит в HTTP-сервер приложения, хранилище подменено `fetch`.
 */

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

const PROD_ENV = {
  APP_DOWNLOAD_BASE_URL: 'https://firsts3.ru/bucket',
  S3_PUBLIC_URL: 'https://media.vedamatch.ru/bucket',
  S3_ENDPOINT: 'https://firsts3.ru',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function createApp(
  env: Record<string, string>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AppReleaseManifestController],
    providers: [
      AppManifestService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

/** `getHttpServer()` типизирован как `any` — приводим к тому, что ждёт supertest. */
function http(app: INestApplication) {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}

describe('GET /notifications/app-release/:variant/latest.json', () => {
  let app: INestApplication | undefined;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(async () => {
    fetchMock.mockRestore();
    await app?.close();
    app = undefined;
  });

  it('отдаёт манифест как есть, читая прямой адрес хранилища', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, manifest));
    app = await createApp(PROD_ENV);

    const response = await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(200);

    expect(response.body).toEqual(manifest);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://firsts3.ru/bucket/mobile/android/ru-site/latest.json',
    );
    // Таймаут обязателен: зависшее хранилище не должно держать запрос.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('второй запрос в течение минуты — из памяти', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, manifest));
    app = await createApp(PROD_ENV);
    await http(app).get('/notifications/app-release/ru-site/latest.json');
    fetchMock.mockResolvedValue(jsonResponse(200, manifest));
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('track=test читает тестовую папку', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, manifest));
    app = await createApp(PROD_ENV);
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json?track=test')
      .expect(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://firsts3.ru/bucket/test/mobile/android/ru-site/latest.json',
    );
  });

  it('хранилище не ответило вовремя — 503, а не зависание', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    );
    app = await createApp(PROD_ENV);
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(503);
  });

  it('хранилище ответило 5xx или не манифестом — 503', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }));
    app = await createApp(PROD_ENV);
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(503);

    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await http(app)
      .get('/notifications/app-release/com-site/latest.json')
      .expect(503);
  });

  it('манифеста в хранилище нет — 404', async () => {
    fetchMock.mockResolvedValue(new Response('<Error/>', { status: 403 }));
    app = await createApp(PROD_ENV);
    await http(app)
      .get('/notifications/app-release/com-site/latest.json')
      .expect(404);
  });

  it('незнакомая сборка — 404 без похода в хранилище', async () => {
    app = await createApp(PROD_ENV);
    await http(app)
      .get('/notifications/app-release/ru-store/latest.json')
      .expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('APP_DOWNLOAD_BASE_URL указывает на публичный прокси — 503 без запроса к нему', async () => {
    app = await createApp({
      ...PROD_ENV,
      APP_DOWNLOAD_BASE_URL: 'https://media.vedamatch.ru/bucket',
    });
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('APP_DOWNLOAD_BASE_URL не задан — 503, публичный адрес не подставляется', async () => {
    app = await createApp({
      S3_PUBLIC_URL: PROD_ENV.S3_PUBLIC_URL,
      S3_ENDPOINT: PROD_ENV.S3_ENDPOINT,
    });
    await http(app)
      .get('/notifications/app-release/ru-site/latest.json')
      .expect(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
