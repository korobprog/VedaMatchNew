/**
 * Боевая сборка или сборка разработчика — от этого зависит, КАК приложение
 * называется в системе: пакет, подпись под иконкой, схема ссылок.
 *
 * Зачем: на Samsung A51 стояла вручную собранная сборка `com.vedamatch.app`
 * с versionCode 5025. Сборки с сайта нумеруются от 1000, Android не ставит
 * их поверх большего номера, а самообновление её не видит — пришлось
 * удалять приложение со всеми данными. Сборка разработчика с отдельным
 * пакетом `com.vedamatch.app.dev` стоит рядом с боевой и ни с ней, ни с её
 * обновлениями не пересекается.
 *
 * По умолчанию — сборка разработчика. Боевой её делает только явное
 * `APP_BUILD_KIND=release`, которое ставит воркфлоу Mobile APK
 * (`.github/workflows/mobile-apk.yml`) и веб-сборка (`Dockerfile.web`).
 * Так безопаснее: забытая переменная в CI даёт APK, который не встанет
 * поверх боевого (сразу видно по имени «VedaMatch Dev»), а забытая
 * переменная у разработчика при обратном умолчании снова дала бы
 * боевой пакет с чужим номером версии на телефоне — ровно случай A51,
 * который лечится только удалением данных.
 *
 * Модуль чистый: его читает `app.config.ts` в Node во время сборки, тесты и
 * приложение в рантайме (схема возврата после входа).
 */

export type BuildKind = 'release' | 'dev';

export interface AppIdentity {
  /** `applicationId` Android — под ним приложение стоит в системе. */
  androidPackage: string;
  /** Подпись под иконкой. */
  name: string;
  /** Схема ссылок: `<scheme>://auth` после входа, `<scheme>://j/<токен>`. */
  scheme: string;
}

const IDENTITY: Record<BuildKind, AppIdentity> = {
  release: { androidPackage: 'com.vedamatch.app', name: 'VedaMatch', scheme: 'vedamatch' },
  // Своя схема обязательна: две установленные сборки с одной `vedamatch://`
  // делили бы возврат из браузера после входа — Android спросил бы, чем
  // открыть, или отдал код не той сборке, у которой нет PKCE-верификатора.
  dev: { androidPackage: 'com.vedamatch.app.dev', name: 'VedaMatch Dev', scheme: 'vedamatch-dev' },
};

const KINDS: readonly BuildKind[] = ['release', 'dev'];

export function resolveBuildKind(env: Record<string, string | undefined>): BuildKind {
  const value = env.APP_BUILD_KIND?.trim();
  if (!value) return 'dev';
  if ((KINDS as readonly string[]).includes(value)) return value as BuildKind;
  throw new Error(`APP_BUILD_KIND="${value}" не поддерживается, ожидается одно из: ${KINDS.join(', ')}`);
}

export function appIdentity(kind: BuildKind): AppIdentity {
  return IDENTITY[kind];
}

/** Адрес, на который API возвращает одноразовый код после входа. */
export function authRedirectFor(scheme: string): string {
  return `${scheme}://auth`;
}

/**
 * Боевая схема по умолчанию: сборка без `scheme` в конфиге (тесты, старые
 * сборки) ведёт себя как раньше.
 */
export const DEFAULT_SCHEME = IDENTITY.release.scheme;

/** Схема из `expoConfig.scheme` собранного приложения (строка или массив). */
export function schemeFromConfig(raw: unknown): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() ? first.trim() : DEFAULT_SCHEME;
}

/**
 * Есть ли в `google-services.json` клиент под этот пакет. Gradle-плагин
 * Google Services валит сборку, если пакета в файле нет («No matching client
 * found for package name»), — поэтому сборке разработчика файл подключается,
 * только если в Firebase заведён и `com.vedamatch.app.dev`. Иначе она
 * собирается без FCM, как любая сборка без файла.
 */
export function firebaseConfigCovers(json: unknown, androidPackage: string): boolean {
  if (!json || typeof json !== 'object') return false;
  const clients = (json as { client?: unknown }).client;
  if (!Array.isArray(clients)) return false;
  return clients.some((client) => {
    const info = (client as { client_info?: { android_client_info?: { package_name?: unknown } } } | null)
      ?.client_info?.android_client_info;
    return info?.package_name === androidPackage;
  });
}
