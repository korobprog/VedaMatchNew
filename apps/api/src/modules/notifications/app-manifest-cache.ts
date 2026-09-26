import { parseReleaseManifest } from './app-release';

/**
 * Манифест самообновления, который API раздаёт приложению: разбор ответа
 * хранилища и кэш в памяти. Чистый модуль — сеть и конфиг живут в
 * `app-manifest.service.ts`.
 */

export type ManifestOutcome =
  /** Манифест как есть — приложение само проверит sha, размер и адрес APK. */
  | { kind: 'ok'; manifest: Record<string, unknown> }
  /** Хранилище ответило «нет такого файла»: сборку ещё не публиковали. */
  | { kind: 'not-found' }
  /** Хранилище недоступно, не успело или отдало не манифест. */
  | { kind: 'unavailable'; reason: string };

/** Публичный бакет без листинга на отсутствующий ключ отвечает 403, а не 404. */
const NOT_FOUND_STATUSES = new Set([403, 404, 410]);

/**
 * Что значит ответ хранилища. `body` — уже разобранный JSON либо
 * `undefined`, если тело не JSON. Сломанный манифест (HTML ошибки с 200,
 * недописанный файл) — «недоступно», а не «вот он»: отдать его приложению
 * значило бы закэшировать мусор на минуту.
 */
export function classifyStorageResponse(
  status: number,
  body: unknown,
): ManifestOutcome {
  if (NOT_FOUND_STATUSES.has(status)) return { kind: 'not-found' };
  if (status < 200 || status >= 300)
    return { kind: 'unavailable', reason: `хранилище ответило ${status}` };
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { kind: 'unavailable', reason: 'ответ хранилища — не JSON-объект' };
  if (!parseReleaseManifest(body))
    return { kind: 'unavailable', reason: 'манифест не разобран' };
  return { kind: 'ok', manifest: body as Record<string, unknown> };
}

/** Сколько живёт в памяти прочитанный манифест (и «не опубликован»). */
export const MANIFEST_CACHE_TTL_MS = 60_000;
/**
 * Сколько помнить сбой хранилища. Коротко — чтобы сеть вернулась быстро, —
 * но не ноль: иначе каждый запрос при лежащем хранилище ждал бы таймаут.
 */
export const MANIFEST_FAILURE_TTL_MS = 10_000;

export interface ManifestCacheOptions {
  load(key: string): Promise<ManifestOutcome>;
  now(): number;
  okTtlMs?: number;
  failureTtlMs?: number;
}

export interface ManifestCache {
  get(key: string): Promise<ManifestOutcome>;
}

/**
 * Кэш по ключу «вариант + папка»: свежее значение — из памяти; устаревшее
 * — одно чтение хранилища на всех одновременных запросивших, а не по
 * запросу на каждого (сотня телефонов, открывших приложение после пуша о
 * выпуске, — одно чтение). `load` не бросает по договору, но если бросит —
 * это тот же сбой хранилища.
 */
export function createManifestCache(
  options: ManifestCacheOptions,
): ManifestCache {
  const okTtl = options.okTtlMs ?? MANIFEST_CACHE_TTL_MS;
  const failureTtl = options.failureTtlMs ?? MANIFEST_FAILURE_TTL_MS;
  const entries = new Map<
    string,
    { outcome: ManifestOutcome; expiresAt: number }
  >();
  const inflight = new Map<string, Promise<ManifestOutcome>>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry && entry.expiresAt > options.now())
        return Promise.resolve(entry.outcome);
      const pending = inflight.get(key);
      if (pending) return pending;
      const loading = options
        .load(key)
        .catch((error: unknown): ManifestOutcome => ({
          kind: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        }))
        .then((outcome) => {
          const ttl = outcome.kind === 'unavailable' ? failureTtl : okTtl;
          entries.set(key, { outcome, expiresAt: options.now() + ttl });
          return outcome;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, loading);
      return loading;
    },
  };
}
