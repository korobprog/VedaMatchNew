/**
 * Чистые правила экрана «Аккаунт и способы входа» (веха 3): подписи
 * провайдеров, разбор `?linked=`/`?linkError=` из адреса возврата после
 * привязки (`auth.service.ts`, `finishLinking`/`redirectLinkError`) и адрес
 * для перехода браузера на привязку Google/Яндекс. Экран и сессия только
 * склеивают их с React и `window`.
 */

export type LinkableProvider = 'google' | 'yandex';

/** Экран «Аккаунт» показывает ровно эти три способа, в этом порядке. */
export const ACCOUNT_PROVIDERS = ['google', 'yandex', 'telegram'] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];

export interface ProviderRow {
  provider: AccountProvider;
  linked: boolean;
  /** Есть смысл только когда `linked` — отвязать непривязанное нельзя. */
  canUnlink: boolean;
}

/**
 * Три строки экрана «Аккаунт» из списка `GET /auth/identities`: способ не
 * найден в ответе — «Не привязан», найден — состояние и признак «последний
 * способ» берутся оттуда. Провайдеры вне тройки (`vk`, `email`) на этом
 * экране не показываются — их у мобильной сборки не бывает.
 */
export function buildProviderRows(
  identities: readonly { provider: string; canUnlink: boolean }[],
): ProviderRow[] {
  return ACCOUNT_PROVIDERS.map((provider) => {
    const found = identities.find((identity) => identity.provider === provider);
    return { provider, linked: Boolean(found), canUnlink: found?.canUnlink ?? false };
  });
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  yandex: 'Яндекс',
  telegram: 'Telegram',
  vk: 'VK',
  email: 'Почта и пароль',
};

/** Название способа входа для интерфейса; незнакомое значение — как есть. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export type LinkQueryResult =
  | { kind: 'linked'; provider: string }
  | { kind: 'error'; code: string }
  | { kind: 'none' };

/**
 * Разбор строки запроса адреса возврата: `?linked=<provider>` — успех,
 * `?linkError=<code>` — отказ (`session` — сессия истекла или подменена,
 * `conflict` — способ уже привязан к другому аккаунту). При обоих
 * параметрах сразу побеждает успех — так не бывает с сервера, но парсер не
 * должен угадывать за него.
 */
export function readLinkQuery(search: string): LinkQueryResult {
  const params = new URLSearchParams(search);
  const linked = params.get('linked');
  if (linked) return { kind: 'linked', provider: linked };
  const code = params.get('linkError');
  if (code) return { kind: 'error', code };
  return { kind: 'none' };
}

const LINK_ERROR_MESSAGES: Record<string, string> = {
  session: 'Сессия истекла — войдите заново и повторите привязку.',
  conflict:
    'Этот способ входа уже привязан к другому аккаунту VedaMatch. Отвяжите его там или войдите под тем аккаунтом.',
};

/** Текст отказа привязки по коду из `?linkError=`. */
export function linkErrorMessage(code: string): string {
  return LINK_ERROR_MESSAGES[code] ?? 'Не удалось привязать способ входа. Попробуйте ещё раз.';
}

/** Текст успеха привязки по `?linked=`. */
export function linkSuccessMessage(provider: string): string {
  return `${providerLabel(provider)} привязан к аккаунту.`;
}

/**
 * Адрес перехода браузера для привязки Google/Яндекс живой сессией:
 * `GET /auth/<provider>?link=1&returnOrigin=...&returnTo=/account`. Сервер
 * отвечает редиректом на OAuth-провайдера, а не JSON — поэтому переход, а
 * не запрос через `ApiClient` (см. `identities-api.ts`).
 */
export function buildLinkUrl(
  apiOrigin: string,
  provider: LinkableProvider,
  returnOrigin: string,
  returnTo = '/account',
): string {
  const url = new URL(`${apiOrigin.replace(/\/+$/, '')}/auth/${provider}`);
  url.searchParams.set('link', '1');
  url.searchParams.set('returnOrigin', returnOrigin);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
