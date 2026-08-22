"use client";

import Image from "next/image";
import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { DevLoginForm } from "@/components/dev-login-form";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";

/**
 * Карточка входа. `returnTo` — уже проверенный внутренний путь: он уезжает
 * в `/auth/google?returnTo=` (API кладёт его в OIDC-cookie и вернёт после
 * callback) и в dev-форму.
 */
export function LoginCard({ returnTo }: { returnTo?: string }) {
  const googleHref =
    returnTo && returnTo !== "/"
      ? `${API_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}`
      : `${API_URL}/auth/google`;
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      
      <div className="glass relative z-10 w-full max-w-sm rounded-3xl border border-glass-brd p-8 text-center">
        {/* Здесь логотип целиком, со словом «VEDA MATCH»: на входе он —
            единственное, что называет продукт, и места под него хватает.
            Заголовок с тем же словом снят, чтобы название не шло дважды. */}
        <Image
          src="/brand/logo.png"
          alt="VedaMatch"
          width={816}
          height={613}
          loading="eager"
          className="mx-auto mb-6 h-auto w-52 dark:hidden"
        />
        <Image
          src="/brand/logo-dark.png"
          alt=""
          aria-hidden
          width={816}
          height={613}
          loading="eager"
          className="mx-auto mb-6 hidden h-auto w-52 dark:block"
        />
        {/* Название страницы есть на картинке, но не в тексте: заголовок
            остаётся для чтения с экрана и для разметки документа. */}
        <h1 className="sr-only">Вход и регистрация в VedaMatch</h1>
        <p className="mb-2 text-sm text-text-1">
          Единый вход во все сервисы экосистемы
        </p>
        {/* Кнопка на лендинге обещает «Начать бесплатно», а страница называлась
            «Вход»: человек не понимал, что аккаунта у него ещё нет и что он
            заведётся сам. Называем это прямо. */}
        <p className="mb-6 text-sm text-text-1">
          Первый вход через Google создаёт аккаунт — отдельная регистрация не
          нужна.
        </p>

        <a
          href={googleHref}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white/10 border border-glass-brd py-3 text-sm font-medium text-text-0 transition hover:bg-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
            />
          </svg>
          Войти через Google
        </a>

        {/* Согласие называется до нажатия, а не после: на этой кнопке заводится
            аккаунт, и ссылки должны быть перед ней в порядке чтения. */}
        {/* text-1, а не text-2: под стеклом фон композитный, и --vm-text-2 на
            12px даёт 4.07:1 — ниже порога AA. Согласие обязано читаться. */}
        <p className="mt-4 text-xs leading-relaxed text-text-1">
          Продолжая, вы принимаете{" "}
          <Link href="/legal/terms" className="underline hover:text-text-0">
            условия использования
          </Link>{" "}
          и{" "}
          <Link href="/legal/privacy" className="underline hover:text-text-0">
            политику конфиденциальности
          </Link>
          .
        </p>

        {DEV_AUTH && <DevLoginForm returnTo={returnTo} />}
      </div>
    </div>
  );
}
