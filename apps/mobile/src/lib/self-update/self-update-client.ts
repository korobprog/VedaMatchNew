import { parseAppManifest, type AppManifest } from './manifest-validation';
import {
  API_MANIFEST_TIMEOUT_MS,
  manifestSources,
  manifestUrl,
  type ManifestSource,
  type ManifestUrlVariant,
} from './manifest-sources';

/**
 * `GET` манифеста самообновления (VED-176). Без `credentials`, без
 * `Authorization`, обычный `fetch` мимо `lib/api/client.ts` (тот клиент
 * заточен под API портала с access-токеном и refresh): манифест публичный.
 *
 * Откуда и в каком порядке спрашивать — `manifest-sources.ts`: сначала API
 * портала, потом зашитый в сборку адрес хранилища. Контур/канал и адреса —
 * из варианта сборки, не хардкод «ru-site», как в `MANIFEST_PATH` веба.
 *
 * Модуль не читает `appVariant()` сам — вариант передаёт хук, поэтому и
 * адреса, и разбор ответа покрыты тестом (`self-update-client.spec.ts`).
 */
export { manifestUrl };
export type { ManifestUrlVariant };

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

/** Сколько ждать ответа хранилища, прежде чем сказать «нет связи» (раунд 002, замечание 6). */
export const MANIFEST_TIMEOUT_MS = 15_000;

/**
 * Какой отказ показать, если не ответил ни один источник. «Нет связи» —
 * первым: повтор может помочь, и кнопка «Повторить» на месте. Непонятный
 * ответ — вторым. «Не опубликовано» — последним: API старого сервера без
 * нового маршрута тоже отвечает 404, и прятать за ним сетевую беду
 * хранилища значило бы убрать кнопку повтора там, где она нужна.
 */
const FAILURE_PRIORITY: ManifestFailureKind[] = ['network', 'malformed', 'not-found', 'not-configured'];

/** Итог по ответам источников, опрошенных по порядку. */
export function combineManifestResults(results: ManifestFetchResult[]): ManifestFetchResult {
  const ok = results.find((result) => result.kind === 'ok');
  if (ok) return ok;
  for (const kind of FAILURE_PRIORITY) {
    if (results.some((result) => result.kind === kind)) return { kind } as ManifestFetchResult;
  }
  return { kind: 'not-configured' };
}

async function fetchManifestFrom(
  source: ManifestSource,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ManifestFetchResult> {
  // Повисшее соединение не должно крутить индикатор вечно: по таймауту
  // запрос прерывается и это та же ветка «нет связи», что и обрыв.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status: number;
  let bodyText: string;
  try {
    const response = await fetchImpl(source.url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    status = response.status;
    bodyText = await response.text();
  } catch {
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
  return classifyManifestResponse(status, bodyText);
}

/**
 * Опрашивает источники по порядку до первого манифеста. `timeoutMs` —
 * общий потолок на каждый источник (для тестов); по умолчанию у API свой,
 * более короткий (`API_MANIFEST_TIMEOUT_MS`), у хранилища — `MANIFEST_TIMEOUT_MS`.
 */
export async function fetchAppManifest(
  variant: ManifestUrlVariant,
  fetchImpl: typeof fetch = fetch,
  timeoutMs?: number,
): Promise<ManifestFetchResult> {
  const sources = manifestSources(variant);
  if (sources.length === 0) return { kind: 'not-configured' };
  const results: ManifestFetchResult[] = [];
  for (const source of sources) {
    const limit = timeoutMs ?? (source.kind === 'api' ? API_MANIFEST_TIMEOUT_MS : MANIFEST_TIMEOUT_MS);
    const result = await fetchManifestFrom(source, fetchImpl, limit);
    if (result.kind === 'ok') return result;
    results.push(result);
  }
  return combineManifestResults(results);
}
