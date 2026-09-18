/**
 * Разбор и проверка `latest.json` — манифеста Android-сборки, раздаваемой с
 * сайта (VED-176). Форма и проверки продублированы из
 * `apps/web/src/lib/app-download.ts:parseAppManifest`: контракт репозитория
 * запрещает импорт между `apps/web` и `apps/mobile` (это два независимых
 * приложения монорепо) — общий хелпер дублируется, а не импортируется.
 * Любая правка формата манифеста (`apps/mobile/scripts/app-manifest.mjs`)
 * должна быть отражена в обоих местах руками.
 */

export interface AppManifest {
  versionName: string;
  versionCode: number;
  sizeBytes: number;
  sha256: string;
  url: string;
  commit: string;
  builtAt: string;
  minAndroid: string;
}

/**
 * `null`, а не исключение: хранилище может отдать HTML страницы ошибки,
 * файла может не быть вовсе (первая публикация ещё не прошла), поле может
 * быть отсутствующим/не того типа. Секция «Проверить обновление» в этом
 * случае обязана тихо сказать «не получилось проверить», а не уронить
 * вкладку «Сервисы».
 */
export function parseAppManifest(raw: unknown): AppManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const versionName = value.versionName;
  const versionCode = value.versionCode;
  const sizeBytes = value.sizeBytes;
  const sha256 = value.sha256;
  const url = value.url;
  const commit = value.commit;
  const builtAt = value.builtAt;
  const minAndroid = value.minAndroid;

  if (typeof versionName !== 'string' || versionName.length === 0) return null;
  if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode <= 0) {
    return null;
  }
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) return null;
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  if (typeof commit !== 'string' || commit.length === 0) return null;
  if (typeof builtAt !== 'string' || Number.isNaN(Date.parse(builtAt))) return null;
  if (typeof minAndroid !== 'string' || minAndroid.length === 0) return null;

  return {
    versionName,
    versionCode,
    sizeBytes,
    sha256: sha256.toLowerCase(),
    url,
    commit,
    builtAt,
    minAndroid,
  };
}
