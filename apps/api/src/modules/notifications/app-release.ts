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

/**
 * Сборки, чей манифест самообновления API отдаёт приложению
 * (`GET /notifications/app-release/:variant/latest.json`). Шире, чем
 * `TRACKED_APP_VARIANTS`: выпуски `com-site` сервер пока не объявляет, но
 * отдать его манифест сборке, которая его спросит, ничего не стоит. Каналу
 * `store` самообновление не положено вовсе — его здесь нет.
 */
export const MANIFEST_APP_VARIANTS = ['ru-site', 'com-site'] as const;
export type ManifestAppVariant = (typeof MANIFEST_APP_VARIANTS)[number];

/**
 * Боевая раздача или тестовая папка (`test/` в бакете, вход `test_folder`
 * воркфлоу Mobile APK) — чтобы сборка стенда проверки самообновления шла
 * через API так же, как боевая, но видела свой манифест.
 */
export type ManifestTrack = 'release' | 'test';

export function isManifestAppVariant(
  value: string,
): value is ManifestAppVariant {
  return (MANIFEST_APP_VARIANTS as readonly string[]).includes(value);
}

/** `?track=` запроса: всё, кроме явного `test`, — боевая раздача. */
export function manifestTrack(raw: unknown): ManifestTrack {
  return raw === 'test' ? 'test' : 'release';
}

/** Адрес манифеста в хранилище с учётом тестовой папки. */
export function appManifestStorageUrl(
  baseUrl: string,
  variant: ManifestAppVariant,
  track: ManifestTrack,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  return appManifestUrl(track === 'test' ? `${base}/test` : base, variant);
}

function hostOf(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

export type ManifestStorageBase =
  { ok: true; baseUrl: string } | { ok: false; reason: string };

/**
 * Откуда API читает манифест: только `APP_DOWNLOAD_BASE_URL` — прямой адрес
 * хранилища (в проде `https://firsts3.ru/<бакет>`).
 *
 * Никогда — публичный адрес для клиентов (`S3_PUBLIC_URL`, сейчас прокси
 * `media.vedamatch.ru` в том же стеке). 24.09 веб при SSR читал манифест
 * через собственный публичный домен, запрос зависал, healthcheck падал, и
 * сайт лежал ~12 минут. `portal/docker-compose.dokploy.yml` подставляет
 * `S3_PUBLIC_URL` в `APP_DOWNLOAD_BASE_URL`, если тот не задан, — поэтому
 * совпадение хостов ловится здесь явно: адрес с хостом публичного и при
 * этом не хранилища (`S3_ENDPOINT`) — отказ. Когда публичный адрес и есть
 * хранилище (как было до переезда 24.09), совпадение безопасно.
 */
export function manifestStorageBase(env: {
  appDownloadBaseUrl?: string;
  s3PublicUrl?: string;
  s3Endpoint?: string;
}): ManifestStorageBase {
  const raw = env.appDownloadBaseUrl?.trim();
  if (!raw) return { ok: false, reason: 'APP_DOWNLOAD_BASE_URL не задан' };
  const host = hostOf(raw);
  if (!host)
    return { ok: false, reason: 'APP_DOWNLOAD_BASE_URL не является адресом' };
  const publicHost = hostOf(env.s3PublicUrl);
  const storageHost = hostOf(env.s3Endpoint);
  if (publicHost && host === publicHost && host !== storageHost) {
    return {
      ok: false,
      reason: `APP_DOWNLOAD_BASE_URL указывает на публичный адрес ${host}, а не на хранилище — свой публичный домен сервер не читает`,
    };
  }
  return { ok: true, baseUrl: raw.replace(/\/+$/, '') };
}
