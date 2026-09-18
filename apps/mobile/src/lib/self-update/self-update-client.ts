import type { AppVariant } from '@/config/variant';
import { parseAppManifest, type AppManifest } from './manifest-validation';

/**
 * `GET` манифеста самообновления (VED-176). Публичный файл в
 * S3-совместимом хранилище портала, как на сайте
 * (`apps/web/src/lib/app-download-api.ts`) — без `credentials`, без
 * `Authorization`, обычный `fetch` мимо `lib/api/client.ts` (тот клиент
 * заточен под API портала с access-токеном и refresh). Контур/канал и
 * базовый адрес — из варианта сборки, не хардкод «ru-site», как в
 * `MANIFEST_PATH` веба: иначе `com-site` не заработает без правки этого файла.
 *
 * Модуль не читает `appVariant()` сам — вариант передаёт хук, поэтому и
 * адрес, и разбор ответа покрыты тестом (`self-update-client.spec.ts`).
 */
const MANIFEST_FILE = 'latest.json';

export type ManifestUrlVariant = Pick<AppVariant, 'downloadBaseUrl' | 'contour' | 'channel'>;

/**
 * `null` — адрес раздачи в сборку не зашит (`APP_DOWNLOAD_BASE_URL` не задан).
 * Итерация 1 молча подставляла сюда адрес сайта, а `vedamatch.ru/mobile/...`
 * отвечает 307 на лендинг (`apps/web/src/proxy.ts`) — проверка всегда
 * заканчивалась ошибкой без подсказки, в чём дело.
 */
export function manifestUrl(variant: ManifestUrlVariant): string | null {
  const base = variant.downloadBaseUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/mobile/android/${variant.contour}-${variant.channel}/${MANIFEST_FILE}`;
}

/**
 * Результат проверки — размеченный, чтобы экран говорил человеку, что именно
 * не так, а не одно «не получилось» на всё.
 */
export type ManifestFetchResult =
  | { kind: 'ok'; manifest: AppManifest }
  /** В сборке нет адреса раздачи — повторять бессмысленно. */
  | { kind: 'not-configured' }
  /** Нет связи, таймаут или сервер хранилища ответил 5xx — стоит повторить позже. */
  | { kind: 'network' }
  /** Манифеста по адресу нет (404; публичный S3 без листинга отвечает на отсутствующий ключ 403). */
  | { kind: 'not-found' }
  /** Ответ пришёл, но это не манифест: HTML вместо JSON, битый JSON, неполные поля. */
  | { kind: 'malformed' };

export type ManifestFailureKind = Exclude<ManifestFetchResult['kind'], 'ok'>;

const NOT_FOUND_STATUSES = new Set([403, 404, 410]);
const RETRYABLE_STATUSES = new Set([408, 429]);

/** Чистая классификация HTTP-ответа по статусу и телу. */
export function classifyManifestResponse(status: number, bodyText: string): ManifestFetchResult {
  if (NOT_FOUND_STATUSES.has(status)) return { kind: 'not-found' };
  if (status >= 500 || RETRYABLE_STATUSES.has(status)) return { kind: 'network' };
  if (status < 200 || status >= 300) return { kind: 'malformed' };

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return { kind: 'malformed' };
  }
  const manifest = parseAppManifest(raw);
  return manifest ? { kind: 'ok', manifest } : { kind: 'malformed' };
}

export async function fetchAppManifest(
  variant: ManifestUrlVariant,
  fetchImpl: typeof fetch = fetch,
): Promise<ManifestFetchResult> {
  const url = manifestUrl(variant);
  if (!url) return { kind: 'not-configured' };

  let status: number;
  let bodyText: string;
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    status = response.status;
    bodyText = await response.text();
  } catch {
    return { kind: 'network' };
  }
  return classifyManifestResponse(status, bodyText);
}
