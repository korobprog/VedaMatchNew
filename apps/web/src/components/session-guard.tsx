"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SESSION_EXPIRED_EVENT } from "@/lib/http-client";

/**
 * Слушает `vedamatch:session-expired` от apiFetch: refresh не помог, значит
 * сессии нет. Уводим на главную с returnTo — там лендинг для гостя, а если
 * cookie ещё жива на другом пути, SilentRefresh вернёт человека обратно.
 * На самой главной и странице входа ничего не делаем: гость там и должен быть.
 */
export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onExpired = () => {
      if (pathname === "/" || pathname.startsWith("/login")) return;
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
      router.refresh();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [pathname, router]);

  return null;
}
