import type { AppVariant } from '@/config/variant';

/**
 * Откуда брать манифест самообновления и в каком порядке — чистая функция,
 * тест рядом (`manifest-sources.spec.ts`).
 *
 * Раньше источник был один: адрес хранилища, зашитый в сборку
 * (`APP_DOWNLOAD_BASE_URL` → `downloadBaseUrl`). 24.09 хранилище сменило
 * домен (s3.firstvds.ru → firsts3.ru → прокси media.vedamatch.ru), и все
 * вышедшие сборки навсегда потеряли обновления: зашитый адрес не отвечал.
 *
 * Теперь первым спрашивается API портала (`apiOrigin` — его домен не
 * меняется): `GET /notifications/app-release/<контур>-<канал>/latest.json`
 * отдаёт тот же манифест, читая хранилище по своему, серверному адресу.
 * Зашитый адрес остаётся запасным — на случай, если API лежит, а хранилище
 * живо. Старые сборки это не спасёт: их код о API не знает.
 */

const MANIFEST_FILE = 'latest.json';

/**
 * Сколько ждать API. Меньше, чем хранилище напрямую (`MANIFEST_TIMEOUT_MS`,
 * 15 с): за API есть запасной путь, и зависший API не должен съедать всё
 * терпение человека. Сервер сам ждёт хранилище не дольше 5 с и отвечает 503.
 */
export const API_MANIFEST_TIMEOUT_MS = 8_000;

export type ManifestUrlVariant = Pick<AppVariant, 'downloadBaseUrl' | 'contour' | 'channel'> & {
  /** Адрес API варианта; `null` — спрашивать только хранилище. */
  apiOrigin: string | null;
};

export type ManifestTrack = 'release' | 'test';

export interface ManifestSource {
  kind: 'api' | 'direct';
  url: string;
}

/**
 * Прямой адрес манифеста в хранилище. `null` — адрес раздачи в сборку не
 * зашит (`APP_DOWNLOAD_BASE_URL` не задан). Итерация 1 молча подставляла сюда
 * адрес сайта, а `vedamatch.ru/mobile/...` отвечает 307 на лендинг
 * (`apps/web/src/proxy.ts`).
 */
export function manifestUrl(variant: Pick<ManifestUrlVariant, 'downloadBaseUrl' | 'contour' | 'channel'>): string | null {
  const base = variant.downloadBaseUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/mobile/android/${variant.contour}-${variant.channel}/${MANIFEST_FILE}`;
}

/**
 * Сборка стенда проверки самообновления смотрит в тестовую папку бакета:
 * воркфлоу Mobile APK с `test_folder=true` собирает её с
 * `APP_DOWNLOAD_BASE_URL=<S3_PUBLIC_URL>/test`
 * (`scripts/release-version.mjs`). Тот же признак ведёт и запрос к API в
 * тестовую папку — иначе тестовая сборка через API увидела бы боевой
 * манифест.
 */
export function manifestTrack(downloadBaseUrl: string | null): ManifestTrack {
  const base = downloadBaseUrl?.trim().replace(/\/+$/, '');
  return base && /\/test$/.test(base) ? 'test' : 'release';
}

/** Адрес манифеста на API портала; `null`, если адреса API нет. */
export function apiManifestUrl(variant: ManifestUrlVariant): string | null {
  const origin = variant.apiOrigin?.trim().replace(/\/+$/, '');
  if (!origin) return null;
  const query = manifestTrack(variant.downloadBaseUrl) === 'test' ? '?track=test' : '';
  return `${origin}/notifications/app-release/${variant.contour}-${variant.channel}/${MANIFEST_FILE}${query}`;
}

/** Источники в порядке опроса: сначала API, потом зашитый адрес хранилища. */
export function manifestSources(variant: ManifestUrlVariant): ManifestSource[] {
  const sources: ManifestSource[] = [];
  const api = apiManifestUrl(variant);
  if (api) sources.push({ kind: 'api', url: api });
  const direct = manifestUrl(variant);
  if (direct) sources.push({ kind: 'direct', url: direct });
  return sources;
}
