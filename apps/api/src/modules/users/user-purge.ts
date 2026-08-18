/**
 * Чистая логика безвозвратного удаления пользователя.
 *
 * Строки в БД сносит каскад Postgres от `User`, а объекты в S3 каскадом не
 * удаляются: их ключи надо собрать до удаления строки и вычистить после.
 * Свои ключи (аватар, галерея) портал знает сам, чужие присылают сервисы
 * в ответ на событие `portal.user.purge-requested` — модуль users не читает
 * их таблицы.
 *
 * Слияние вкладов и проверка подтверждения вынесены сюда, чтобы покрываться
 * тестом отдельно от непроверяемой обвязки с S3, Prisma и шиной.
 */

/** Что сервис отдаёт порталу в ответ на запрос удаления аккаунта. */
export interface UserPurgeContribution {
  /** Ключи объектов в хранилище, которые после удаления станут мусором. */
  storageKeys: string[];
  /**
   * Счётчики для отчёта администратору: `{ listings: 3 }`, `{ notices: 2 }`.
   * Ключи произвольные — портал их только складывает и показывает.
   */
  counts?: Record<string, number>;
}

export interface UserPurgePlan {
  storageKeys: string[];
  counts: Record<string, number>;
}

/**
 * Ключи загруженных файлов всегда относительные (`users/...`, `market/...`).
 * Абсолютный URL встречается только у демо-данных и указывает на чужой объект —
 * его трогать нельзя.
 */
export function isDirectUrl(storageKey: string): boolean {
  return (
    storageKey.startsWith('/') ||
    storageKey.startsWith('http://') ||
    storageKey.startsWith('https://')
  );
}

/**
 * Складывает вклады сервисов в один план: внешние URL отсеиваются, дубликаты
 * схлопываются, порядок сохраняется — по нему удобно читать лог. Подписчик мог
 * упасть или вернуть мусор, поэтому всё, что не похоже на вклад, пропускается:
 * из-за одного сломанного сервиса удаление аккаунта вставать не должно.
 */
export function mergePurgeContributions(
  contributions: readonly unknown[],
): UserPurgePlan {
  const storageKeys: string[] = [];
  const counts: Record<string, number> = {};

  for (const contribution of contributions) {
    if (!isContribution(contribution)) continue;
    for (const key of contribution.storageKeys) {
      if (typeof key !== 'string' || !key || isDirectUrl(key)) continue;
      storageKeys.push(key);
    }
    for (const [name, value] of Object.entries(contribution.counts ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      counts[name] = (counts[name] ?? 0) + value;
    }
  }

  return { storageKeys: [...new Set(storageKeys)], counts };
}

/**
 * Безвозвратное удаление подтверждается точным вводом email аккаунта.
 * Регистр и пробелы по краям не важны — всё остальное важно.
 */
export function isPurgeConfirmed(
  confirmEmail: string | undefined,
  actualEmail: string,
): boolean {
  if (!confirmEmail) return false;
  return confirmEmail.trim().toLowerCase() === actualEmail.trim().toLowerCase();
}

function isContribution(value: unknown): value is UserPurgeContribution {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as UserPurgeContribution).storageKeys)
  );
}
