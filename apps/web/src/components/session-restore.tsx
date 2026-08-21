"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { getSafeReturnTo, loginHref } from "@/lib/return-to";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MARKER = "vm_session";
const FAILED_KEY = "vm_session_restore_failed";

/**
 * После неудачного refresh API снимает маркер сам, но если cookie ставилась
 * с другим `domain`, клиентская чистка подстрахует от петли «splash → refresh
 * → splash».
 */
function dropMarkerCookie() {
  const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = `${MARKER}=; ${expired}`;
  const parts = window.location.hostname.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    const domain = parts.slice(i).join(".");
    document.cookie = `${MARKER}=; ${expired}; domain=${domain}`;
    document.cookie = `${MARKER}=; ${expired}; domain=.${domain}`;
  }
}

/**
 * Splash «Восстанавливаем сессию…» вместо лендинга/формы входа для того, у кого
 * истёк access-токен, но жив refresh. Один запрос на `/auth/refresh`; удача →
 * возвращаемся на `returnTo`, провал → снимаем маркер и перерисовываем
 * страницу сервером (он покажет лендинг или форму входа).
 */
export function SessionRestore({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const destination = getSafeReturnTo(returnTo);

  useEffect(() => {
    // Повторный заход на splash сразу после провала — значит маркер снять
    // не удалось; не крутим refresh по кругу, показываем ссылки.
    let cancelled = false;
    const lastFail = Number(sessionStorage.getItem(FAILED_KEY) ?? 0);
    if (Date.now() - lastFail < 15_000) {
      const timer = setTimeout(() => {
        if (!cancelled) setFailed(true);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          sessionStorage.removeItem(FAILED_KEY);
          router.replace(destination);
          router.refresh();
          return;
        }
        sessionStorage.setItem(FAILED_KEY, String(Date.now()));
        dropMarkerCookie();
        setFailed(true);
        router.refresh();
      })
      .catch(() => {
        if (cancelled) return;
        sessionStorage.setItem(FAILED_KEY, String(Date.now()));
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [destination, router]);

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <div
        role="status"
        aria-live="polite"
        className="glass relative z-10 w-full max-w-sm rounded-3xl border border-glass-brd p-8 text-center"
      >
        {failed ? (
          <>
            <p className="font-display text-lg font-semibold text-text-0">
              Не удалось восстановить сессию
            </p>
            <p className="mt-2 text-sm text-text-1">
              Войдите заново — мы вернём вас на ту же страницу.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href={loginHref(destination)}
                className="rounded-xl bg-magenta px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)]"
              >
                Войти
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-glass-brd px-4 py-2.5 text-sm font-medium text-text-1 transition hover:text-text-0"
              >
                На главную
              </Link>
            </div>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-glass-brd border-t-magenta"
            />
            <p className="font-display text-lg font-semibold text-text-0">
              Восстанавливаем сессию…
            </p>
            <p className="mt-2 text-sm text-text-1">Секунду, вы уже входили.</p>
          </>
        )}
      </div>
    </div>
  );
}
