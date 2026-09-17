"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SESSION_EXPIRED_EVENT, refreshSession } from "@/lib/http-client";

/** Пауза перед контрольным refresh: соседняя вкладка успевает записать cookie. */
export const SESSION_RECHECK_DELAY_MS = 1_500;

/**
 * Слушает `vedamatch:session-expired` от apiFetch: refresh не помог.
 * Прежде чем увести человека, переспрашиваем сессию ещё раз после паузы —
 * отказ мог быть сбоем связи или гонкой с соседней вкладкой, а не концом
 * сессии, и тогда человек остаётся на месте. Не помогло — уводим на главную
 * с returnTo: там лендинг для гостя, а если cookie ещё жива на другом пути,
 * SilentRefresh вернёт человека обратно. На самой главной и странице входа
 * ничего не делаем: гость там и должен быть.
 */
export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const checking = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const onExpired = () => {
      if (pathname === "/" || pathname.startsWith("/login")) return;
      // Пачка запросов страницы присылает событие десятком — проверка одна.
      if (checking.current) return;
      checking.current = true;
      setTimeout(() => {
        void refreshSession().then((ok) => {
          checking.current = false;
          if (cancelled) return;
          if (ok) {
            router.refresh();
            return;
          }
          const returnTo = `${window.location.pathname}${window.location.search}`;
          router.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
          router.refresh();
        });
      }, SESSION_RECHECK_DELAY_MS);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [pathname, router]);

  return null;
}
