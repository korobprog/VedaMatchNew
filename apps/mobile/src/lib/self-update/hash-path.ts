/**
 * Каким путём считать SHA-256 скачанного APK (VED-176, итерация 3).
 *
 * `native` — модуль `VedamatchFileHash` (`modules/vedamatch-file-hash`,
 * `MessageDigest` в фоновом потоке): на A51 ожидается 1–3 с на 155 МБ.
 * `js` — запасной чистый JS-хешер по кускам (`chunked-hash.ts`): работает
 * везде, но на Hermes около 1 МБ/с (замер раунда 002: ~2,5 мин на 155 МБ).
 *
 * Запасной путь нужен, когда модуля нет (iOS, веб, сборка без него) или
 * нативный вызов упал не из-за отмены (например, неожиданная схема URI).
 */
export type HashPath = 'native' | 'js';

export interface HashPathInput {
  platformOS: string;
  nativeModuleAvailable: boolean;
}

export function chooseHashPath({ platformOS, nativeModuleAvailable }: HashPathInput): HashPath {
  return platformOS === 'android' && nativeModuleAvailable ? 'native' : 'js';
}

/** Код отказа нативного модуля при отмене — не повод падать на JS-путь. */
export const NATIVE_HASH_CANCELLED_CODE = 'ERR_HASH_CANCELLED';

/**
 * После ошибки нативного пути: отмену пробрасываем как отмену, остальное —
 * повод посчитать тем же файлом через JS (медленно, но проверка не теряется).
 */
export function nativeHashFailureAction(error: unknown): 'cancelled' | 'fallback-to-js' {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === NATIVE_HASH_CANCELLED_CODE ? 'cancelled' : 'fallback-to-js';
}
