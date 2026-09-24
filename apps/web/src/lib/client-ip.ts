import { headers } from "next/headers";

/**
 * Заголовки, по которым API узнаёт адрес человека за серверным рендером.
 *
 * Страницы портала ходят в API по внутреннему адресу (`API_INTERNAL_URL`), и
 * для API источником всех таких запросов был один IP — контейнер веба.
 * Глобальный троттлер (`ThrottlerModule`, 100 запросов в минуту на адрес)
 * складывал рендеры всех посетителей в одно ведро: как только портал
 * открывали чуть чаще, `/services/public` из корневого layout отвечал 429,
 * и любая страница — приглашение в «Работу», Вдохновение, лендинг —
 * падала в «Страница не открылась». Ошибка была не пользователя, а общая.
 *
 * Traefik ставит адрес клиента в `x-forwarded-for`, Next его не трогает.
 * Пробрасываем его дальше, в API: там `app.set('trust proxy', 1)` верит
 * одному прокси — тому, кто держит сокет, — и берёт из заголовка адрес
 * посетителя. Лимит снова считается на человека, а не на весь портал.
 */
export const CLIENT_IP_HEADERS = ["x-forwarded-for", "x-real-ip"] as const;

/** Чистая часть: какие из заголовков запроса стоит передать дальше. */
export function pickClientIpHeaders(
  get: (name: string) => string | null | undefined,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of CLIENT_IP_HEADERS) {
    const value = get(name)?.trim();
    if (value) picked[name] = value;
  }
  return picked;
}

/**
 * Заголовки с адресом клиента для `fetch` из серверного компонента.
 * Вне запроса (сборка, тесты без контекста) — пустой объект: `headers()`
 * там бросает, а падать из-за этого нечему.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  try {
    const incoming = await headers();
    return pickClientIpHeaders((name) => incoming.get(name));
  } catch {
    return {};
  }
}
