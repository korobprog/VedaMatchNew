/**
 * Уборка скачанного APK из кэша (VED-176, итерация 3). Файл называется по
 * версии (`vedamatch-update-<versionCode>.apk`), чтобы при следующем запуске
 * было понятно, поставлен ли он уже: установка перезапускает процесс, и
 * удалить файл «после установки» некому — раунд 002 нашёл 228 МБ кэша.
 */
export const CACHED_APK_PREFIX = 'vedamatch-update';

export function cachedApkFileName(versionCode: number): string {
  return `${CACHED_APK_PREFIX}-${versionCode}.apk`;
}

/**
 * Версия из имени файла. `null` — файл наш, но версия не читается (старое имя
 * итерации 1–2 `vedamatch-update.apk`). `undefined` — файл не наш, не трогать.
 */
export function parseCachedApkVersion(fileName: string): number | null | undefined {
  if (fileName === `${CACHED_APK_PREFIX}.apk`) return null;
  const match = /^vedamatch-update-(\d+)\.apk$/.exec(fileName);
  if (!match) return fileName.startsWith(`${CACHED_APK_PREFIX}`) && fileName.endsWith('.apk') ? null : undefined;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export interface CachedApkInput {
  fileName: string;
  /** versionCode установленного приложения; `null` — неизвестен. */
  installedVersionCode: number | null;
}

/**
 * Удалять ли файл при запуске: чужие файлы — никогда; наш файл без версии —
 * да (его не с чем сравнить и не для чего переиспользовать); версия не новее
 * установленной — да (уже поставлен или устарел). Более новый файл остаётся:
 * человек мог отказаться в установщике, его сотрёт следующая закачка.
 */
export function shouldDeleteCachedApk({ fileName, installedVersionCode }: CachedApkInput): boolean {
  const version = parseCachedApkVersion(fileName);
  if (version === undefined) return false;
  if (version === null) return true;
  if (installedVersionCode == null) return true;
  return installedVersionCode >= version;
}

/** Перед новой закачкой удаляются все наши APK — любой версии. */
export function isOwnCachedApk(fileName: string): boolean {
  return parseCachedApkVersion(fileName) !== undefined;
}
