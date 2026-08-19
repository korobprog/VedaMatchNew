import { cookies } from "next/headers";

/**
 * Не-httpOnly маркер «сессия есть», который API ставит вместе с refresh-cookie
 * (та живёт на `path=/auth` и серверу Next не видна). По маркеру решаем, что
 * показать вошедшему с истёкшим access-токеном: не лендинг для гостя, а
 * короткий splash с тихим refresh.
 */
export const SESSION_MARKER_COOKIE = "vm_session";
export const ACCESS_COOKIE = "access_token";

/** Есть маркер сессии, но нет access-cookie — самое время тихо обновиться. */
export async function needsSessionRestore(): Promise<boolean> {
  const store = await cookies();
  return store.has(SESSION_MARKER_COOKIE) && !store.has(ACCESS_COOKIE);
}
