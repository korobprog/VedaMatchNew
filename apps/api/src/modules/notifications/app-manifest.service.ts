import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  classifyStorageResponse,
  createManifestCache,
  type ManifestCache,
  type ManifestOutcome,
} from './app-manifest-cache';
import {
  appManifestStorageUrl,
  manifestStorageBase,
  type ManifestAppVariant,
  type ManifestStorageBase,
  type ManifestTrack,
} from './app-release';

/**
 * Сколько ждать хранилище на один запрос приложения. Меньше таймаута
 * клиента (8 с на API в `self-update/manifest-sources.ts`): приложение
 * должно получить честный 503 и успеть уйти на запасной адрес, а не
 * оборвать запрос само.
 */
export const MANIFEST_STORAGE_TIMEOUT_MS = 5_000;

/**
 * Манифест самообновления через API (`app-release-manifest.controller.ts`).
 *
 * Зачем через API: адрес хранилища зашит в сборку приложения
 * (`APP_DOWNLOAD_BASE_URL` → `downloadBaseUrl`), и 24.09, когда хранилище
 * сменило домен (s3.firstvds.ru → firsts3.ru → прокси media.vedamatch.ru),
 * все вышедшие сборки навсегда потеряли обновления. Домен API не меняется.
 *
 * Читает тем же способом, что `AppReleaseWorkerService.fetchManifest`:
 * прямой адрес хранилища, `fetch` с таймаутом, — но только из
 * `APP_DOWNLOAD_BASE_URL` и никогда из публичного адреса, см.
 * `manifestStorageBase`.
 */
@Injectable()
export class AppManifestService {
  private readonly logger = new Logger(AppManifestService.name);
  private readonly base: ManifestStorageBase;
  private readonly cache: ManifestCache;

  constructor(config: ConfigService) {
    this.base = manifestStorageBase({
      appDownloadBaseUrl: config.get<string>('APP_DOWNLOAD_BASE_URL'),
      s3PublicUrl: config.get<string>('S3_PUBLIC_URL'),
      s3Endpoint: config.get<string>('S3_ENDPOINT'),
    });
    if (!this.base.ok)
      this.logger.warn(
        `Манифест приложения через API отключён: ${this.base.reason}`,
      );
    this.cache = createManifestCache({
      load: (key) => this.load(key),
      now: () => Date.now(),
    });
  }

  latest(
    variant: ManifestAppVariant,
    track: ManifestTrack,
  ): Promise<ManifestOutcome> {
    if (!this.base.ok)
      return Promise.resolve({ kind: 'unavailable', reason: this.base.reason });
    return this.cache.get(
      appManifestStorageUrl(this.base.baseUrl, variant, track),
    );
  }

  /** Ключ кэша — сам адрес в хранилище. */
  private async load(url: string): Promise<ManifestOutcome> {
    let outcome: ManifestOutcome;
    try {
      const response = await fetch(url, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(MANIFEST_STORAGE_TIMEOUT_MS),
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        // Таймаут, пришедший посреди тела, — сбой хранилища, а не «не JSON».
        if (error instanceof Error && error.name === 'TimeoutError')
          throw error;
        body = undefined;
      }
      outcome = classifyStorageResponse(response.status, body);
    } catch (error) {
      outcome = {
        kind: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (outcome.kind === 'unavailable')
      this.logger.warn(`Манифест ${url} не прочитан: ${outcome.reason}`);
    return outcome;
  }
}
