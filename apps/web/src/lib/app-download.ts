/**
 * Публичная раздача Android-приложения с сайта (VED-176).
 *
 * Чистая логика — разбор и форматирование манифеста `latest.json`, который
 * пишет `.github/workflows/mobile-apk.yml` (см. также
 * `apps/mobile/scripts/app-manifest.mjs`). Сетевой запрос живёт рядом, в
 * `app-download-api.ts` (серверный, использует `fetch` с `revalidate`).
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
 * Разбор ответа `latest.json` с защитой от любой формы «сломанности»:
 * файла ещё нет (первая публикация не прошла), хранилище вернуло HTML
 * страницы ошибки вместо JSON, поле отсутствует или не того типа. Карточка
 * Android в этом случае обязана тихо показать «скоро», а не уронить всю
 * секцию — поэтому `null`, а не исключение.
 */
export function parseAppManifest(raw: unknown): AppManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const versionName = value.versionName;
  const versionCode = value.versionCode;
  const sizeBytes = value.sizeBytes;
  const sha256 = value.sha256;
  const url = value.url;
  const commit = value.commit;
  const builtAt = value.builtAt;
  const minAndroid = value.minAndroid;

  if (typeof versionName !== "string" || versionName.length === 0) return null;
  if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode <= 0) {
    return null;
  }
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sha256)) return null;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
  if (typeof commit !== "string" || commit.length === 0) return null;
  if (typeof builtAt !== "string" || Number.isNaN(Date.parse(builtAt))) return null;
  if (typeof minAndroid !== "string" || minAndroid.length === 0) return null;

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

/** «42,3 МБ» — один знак после запятой, русский разделитель дробной части. */
export function formatApkSizeMb(sizeBytes: number): string {
  const megabytes = sizeBytes / (1024 * 1024);
  return `${megabytes.toFixed(1).replace(".", ",")} МБ`;
}

/** «17 сентября 2026 г.» — дата сборки в карточке, без времени: оно не нужно человеку. */
export function formatBuildDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Первые восемь знаков хэша — под раскрытым «Проверить файл» этого достаточно, полный — рядом. */
export function shortSha256(sha256: string): string {
  return sha256.slice(0, 8);
}
