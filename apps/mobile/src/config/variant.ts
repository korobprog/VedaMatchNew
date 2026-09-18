/**
 * Вариант сборки приложения.
 *
 * Контур зашит в сборку, а не выбирается на экране входа: российская сборка
 * уходит в RuStore и раздаётся с vedamatch.ru, глобальная — в Google Play и с
 * vedamatch.com. Канал решает, умеет ли приложение обновлять себя само: Google
 * Play запрещает разрешение на установку пакетов, поэтому самообновление есть
 * только у файла, скачанного с сайта.
 *
 * Модуль чистый: его читает и `app.config.ts` в Node во время сборки, и тесты.
 */

export type Contour = 'ru' | 'com';
export type Channel = 'site' | 'store';
export type PushProvider = 'rustore' | 'fcm';

export interface AppVariant {
  contour: Contour;
  channel: Channel;
  apiOrigin: string;
  webOrigin: string;
  /**
   * Публичный адрес раздачи `latest.json`/APK для самообновления (VED-176,
   * `self-update-client.ts`) — `APP_DOWNLOAD_BASE_URL` при сборке, тот же
   * адрес, что `S3_PUBLIC_URL` портала. `null`, если переменная не задана:
   * запасного значения нет намеренно. Сайт (`webOrigin`) этот путь не
   * раздаёт — `vedamatch.ru/mobile/...` отвечает 307 на лендинг
   * (`apps/web/src/proxy.ts`), и сборка без адреса молча получала бы вечную
   * ошибку. С `null` секция самообновления прямо говорит «Адрес обновлений
   * не настроен в этой сборке».
   */
  downloadBaseUrl: string | null;
  selfUpdate: boolean;
  /** Порядок важен: первый провайдер основной, остальные запасные. */
  pushProviders: PushProvider[];
}

const ORIGINS: Record<Contour, { api: string; web: string }> = {
  ru: { api: 'https://api.vedamatch.ru', web: 'https://vedamatch.ru' },
  com: { api: 'https://api.vedamatch.com', web: 'https://vedamatch.com' },
};

/** Адреса продового API: в отладочной сборке их подменяет devApiOrigin. */
export const PRODUCTION_API_ORIGINS: readonly string[] = [ORIGINS.ru.api, ORIGINS.com.api];

const PUSH: Record<Contour, PushProvider[]> = {
  ru: ['rustore', 'fcm'],
  com: ['fcm'],
};

export type VariantEnv = Record<string, string | undefined>;

function pick<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw?.trim();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `${name}="${value}" не поддерживается, ожидается одно из: ${allowed.join(', ')}`,
  );
}

/**
 * Адрес для разработки: эмулятор Android ходит на машину разработчика через
 * `http://10.0.2.2:4000`. Принимаем только http(s) без пути, иначе клиент
 * склеит маршрут с мусором и ошибка всплывёт уже в рантайме на телефоне.
 */
function originOverride(name: string, raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}="${value}" не является адресом`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name}="${value}": нужен http или https`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name}="${value}": укажите только origin, без пути`);
  }
  return url.origin;
}

/**
 * Адрес раздачи манифеста самообновления (`APP_DOWNLOAD_BASE_URL`): в
 * отличие от `originOverride` выше, путь разрешён — публичный адрес
 * S3-совместимого хранилища часто устроен как `https://host/bucket-name`, а
 * не голый origin. Проверяем только протокол и то, что это вообще адрес.
 */
function publicBaseUrlOverride(name: string, raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}="${value}" не является адресом`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name}="${value}": нужен http или https`);
  }
  return value.replace(/\/+$/, '');
}

export function resolveVariant(env: VariantEnv): AppVariant {
  const contour = pick('APP_CONTOUR', env.APP_CONTOUR, ['ru', 'com'], 'ru');
  const channel = pick('APP_CHANNEL', env.APP_CHANNEL, ['site', 'store'], 'site');
  const webOrigin = originOverride('APP_WEB_ORIGIN', env.APP_WEB_ORIGIN) ?? ORIGINS[contour].web;

  return {
    contour,
    channel,
    apiOrigin: originOverride('APP_API_ORIGIN', env.APP_API_ORIGIN) ?? ORIGINS[contour].api,
    webOrigin,
    downloadBaseUrl: publicBaseUrlOverride('APP_DOWNLOAD_BASE_URL', env.APP_DOWNLOAD_BASE_URL),
    selfUpdate: channel === 'site',
    pushProviders: [...PUSH[contour]],
  };
}
