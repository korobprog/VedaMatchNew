import { headers } from "next/headers";
import type { AuthProviderId } from "@/components/login-card";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Способ входа, который показываем всегда, если список получить не удалось.
 * Страница входа без единой кнопки — отказ в обслуживании; лучше показать то,
 * что работает с первого дня портала.
 */
const FALLBACK: readonly AuthProviderId[] = ["google"];

const KNOWN: readonly string[] = ["google", "yandex", "vk", "email"];

/**
 * Включённые способы входа с сервера, в заданном админом порядке.
 *
 * Хост портала передаётся явно: серверный компонент ходит к API по внутреннему
 * адресу (`http://api:4000`), и `req.hostname` там — `api`, а не домен, под
 * которым человек открыл сайт. Сверять настройки было бы не с чем.
 */
export async function getAuthProviders(): Promise<readonly AuthProviderId[]> {
  const host = (await headers()).get("host") ?? "";
  const url = `${API_URL}/auth/providers?host=${encodeURIComponent(host)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return FALLBACK;
    const body = (await res.json()) as { providers?: unknown };
    if (!Array.isArray(body.providers)) return FALLBACK;
    return body.providers.filter((id): id is AuthProviderId =>
      KNOWN.includes(id as string),
    );
  } catch {
    // API недоступен — страница входа обязана остаться рабочей.
    return FALLBACK;
  }
}
