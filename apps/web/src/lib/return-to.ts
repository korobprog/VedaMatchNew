/**
 * Путь возврата после входа. Клиентская и серверная версии одной проверки:
 * принимаем только внутренний путь — одна ведущая косая, не `//host`, без
 * схемы. Всё остальное схлопывается в `/`. Зеркало `safeReturnTo` в API.
 */
export function getSafeReturnTo(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }
  const baseUrl = "https://vedamatch.local";
  let destination: URL;
  try {
    destination = new URL(returnTo, baseUrl);
  } catch {
    return "/";
  }
  return destination.origin === baseUrl
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : "/";
}

/** `/login?returnTo=…` — или просто `/login`, если возвращаться некуда. */
export function loginHref(returnTo?: string | null): string {
  const safe = getSafeReturnTo(returnTo);
  if (safe === "/") return "/login";
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}
