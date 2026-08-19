import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserProfile } from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { loginHref } from "@/lib/return-to";

export { loginHref } from "@/lib/return-to";

/**
 * Путь текущего запроса, который proxy.ts кладёт в заголовок: у серверных
 * layout'ов и вложенных helper'ов другого способа узнать URL нет.
 * Зеркало константы в src/proxy.ts.
 */
export const PATHNAME_HEADER = "x-pathname";

/**
 * Серверный guard страницы: профиль не получен → уводим на вход и запоминаем,
 * куда вернуть. `pathname` — маршрут текущей страницы (литерал или собранный
 * из params). Возвращает `never`, поэтому после `if (!user) redirectToLogin(...)`
 * TypeScript сужает `user` так же, как после `redirect("/login")`.
 */
export function redirectToLogin(pathname: string): never {
  redirect(loginHref(pathname));
}

/**
 * Guard для группы маршрутов `(portal)`: layout уже требует сессию, но
 * страницы, которым нужен сам профиль, зовут это же — с React.cache второй
 * вызов бесплатен, а redirect в обоих местах одинаковый, поэтому неважно,
 * кто из них (layout или страница, они рендерятся параллельно) сработает первым.
 * Без заголовка от proxy (например, в тестах) возвращаем просто на /login.
 */
export async function requireUser(): Promise<UserProfile> {
  const user = await getProfile();
  if (user) return user;
  const pathname = (await headers()).get(PATHNAME_HEADER);
  redirect(loginHref(pathname));
}
