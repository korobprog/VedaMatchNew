/**
 * Решение «что делать с результатом хеширования» скачанного APK (VED-176).
 * Само хеширование файла — асинхронное, читает диск (`FileSystem`/
 * `expo-crypto`) — живёт в `apk-downloader.ts` и не тестируется юнит-тестом
 * (проверяется только на телефоне); здесь — только сравнение, чистое.
 */
export type Sha256Verdict = 'match' | 'mismatch';

/**
 * Регистронезависимо: `manifest-validation.ts` уже приводит `sha256` из
 * манифеста к нижнему регистру, но защититься от чужого источника
 * (напрямую собранный манифест, ручной тест-стенд) не помешает.
 */
export function verifyDownloadedFile(computedHex: string, expectedHex: string): Sha256Verdict {
  return computedHex.trim().toLowerCase() === expectedHex.trim().toLowerCase() ? 'match' : 'mismatch';
}
