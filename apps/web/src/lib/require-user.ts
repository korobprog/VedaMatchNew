import { redirect } from "next/navigation";
import { loginHref } from "@/lib/return-to";

export { loginHref } from "@/lib/return-to";

/**
 * Серверный guard страницы: профиль не получен → уводим на вход и запоминаем,
 * куда вернуть. `pathname` — маршрут текущей страницы (литерал или собранный
 * из params). Возвращает `never`, поэтому после `if (!user) redirectToLogin(...)`
 * TypeScript сужает `user` так же, как после `redirect("/login")`.
 */
export function redirectToLogin(pathname: string): never {
  redirect(loginHref(pathname));
}
