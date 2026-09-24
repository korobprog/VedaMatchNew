/**
 * Выпуски приложения с сайта: как сервер узнаёт о новой версии и кого зовёт
 * обновиться. Чистый модуль — сеть, база и отправка живут в
 * `app-release-worker.service.ts`.
 *
 * Источник правды — манифест `latest.json`, который воркфлоу «Mobile APK»
 * кладёт в S3 рядом с APK. Его же читает самообновление в приложении и
 * страница /app на сайте, поэтому «вышла версия» для сервера значит ровно
 * то же, что для человека: её уже можно скачать.
 */

/** Сборки, за выпусками которых следит сервер. `com-site` пока не раздаётся. */
export const TRACKED_APP_VARIANTS = ['ru-site'] as const;

/** Страница загрузки приложения на портале — туда ведёт пост и пуш. */
export const APP_DOWNLOAD_PATH = '/app';

/** Событие шины о выпуске; подписчик — официальный канал «Общения». */
export const APP_RELEASE_PUBLISHED = 'app.release.published';

/** Заметка «что нового» длиннее этого режется: пост канала не резиновый. */
const MAX_NOTES_LENGTH = 1000;

/** Адрес манифеста варианта. Совпадает с `manifestObjectKey` скрипта CI. */
export function appManifestUrl(baseUrl: string, variant: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/mobile/android/${variant}/latest.json`;
}

export type ReleaseManifest = {
  versionCode: number;
  versionName: string;
  notes: string | null;
  builtAt: Date | null;
};

/**
 * Разбор манифеста. `null` на всё непохожее: хранилище отдаёт HTML ошибки,
 * файл недописан, поле не того типа. Сломанный манифест — не новая версия.
 * Проверяются только поля, нужные серверу: sha и размер проверяет
 * приложение при скачивании.
 */
export function parseReleaseManifest(raw: unknown): ReleaseManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const { versionCode, versionName, notes, builtAt } = value;
  if (
    typeof versionCode !== 'number' ||
    !Number.isInteger(versionCode) ||
    versionCode <= 0 ||
    versionCode > 2_147_483_647
  )
    return null;
  if (typeof versionName !== 'string' || !versionName.trim()) return null;
  const built =
    typeof builtAt === 'string' && !Number.isNaN(Date.parse(builtAt))
      ? new Date(builtAt)
      : null;
  const text = typeof notes === 'string' ? notes.trim() : '';
  return {
    versionCode,
    versionName: versionName.trim().slice(0, 64),
    notes: text ? text.slice(0, MAX_NOTES_LENGTH) : null,
    builtAt: built,
  };
}

/**
 * Статус новой строки выпуска.
 *
 * - Первое чтение манифеста (строк ещё нет) — `baseline`: это версия, которую
 *   сервер застал при выкатке, а не новость. Иначе первый же деплой объявил
 *   бы в канале давно вышедшую версию и разбудил бы пушами всех.
 * - Номер больше всех известных — `pending`: вышла новая, объявить и звать.
 * - Меньше известного — откат (выложили прежний APK поверх сломанного):
 *   тоже `baseline`, о нём не объявляют.
 */
export function newReleaseStatus(
  maxKnownVersionCode: number | null,
  versionCode: number,
): 'baseline' | 'pending' {
  if (maxKnownVersionCode === null) return 'baseline';
  return versionCode > maxKnownVersionCode ? 'pending' : 'baseline';
}
