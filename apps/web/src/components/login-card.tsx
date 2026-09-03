"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, ReactElement } from "react";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { DevLoginForm } from "@/components/dev-login-form";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";

/** Значение cookie по имени; на сервере — пусто. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export type AuthProviderId = "google" | "yandex" | "vk" | "email";

const GoogleMark = () => (
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
);

// Заглушка под официальный знак Яндекса: до боевого включения его нужно
// положить в public/ по фирменным правилам Яндекс ID.
const YandexMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#FC3F1D" />
    <path
      fill="#fff"
      d="M13.1 18.6h1.9V5.4h-2.8c-2.8 0-4.3 1.4-4.3 3.6 0 1.7.8 2.7 2.3 3.7l-2.6 5.9h2.1l2.9-6.4-1-.7c-1.2-.8-1.7-1.4-1.7-2.6 0-1.1.7-1.8 2.1-1.8h1.1v11.5Z"
    />
  </svg>
);

const MailMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="m3.5 7 8.5 6 8.5-6" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/**
 * Подписи и адреса способов входа. Список включённых приходит с сервера, а
 * зашивать его сюда нельзя: каждое переключение галочки в настройках
 * требовало бы пересборки фронта.
 */
const PROVIDERS: Record<
  AuthProviderId,
  { label: string; path: string; Mark: () => ReactElement }
> = {
  google: { label: "Войти через Google", path: "/auth/google", Mark: GoogleMark },
  yandex: { label: "Войти с Яндекс ID", path: "/auth/yandex", Mark: YandexMark },
  vk: { label: "Войти через VK ID", path: "/auth/vk", Mark: MailMark },
  email: { label: "Войти по почте", path: "/auth/email", Mark: MailMark },
};

/**
 * Карточка входа. `returnTo` — уже проверенный внутренний путь: он уезжает
 * в `/auth/<провайдер>?returnTo=` (API кладёт его в OIDC-cookie и вернёт
 * после callback) и в dev-форму.
 *
 * Туда же уезжают реферальный код и отпечаток устройства из cookie, которые
 * положил proxy.ts. Параметрами, а не cookie: веб и API живут на разных
 * доменах, и общей cookie между ними может не быть.
 */
export function LoginCard({
  providers,
  returnTo,
}: {
  providers: readonly AuthProviderId[];
  returnTo?: string;
}) {
  const hrefFor = (path: string) =>
    returnTo && returnTo !== "/"
      ? `${API_URL}${path}?returnTo=${encodeURIComponent(returnTo)}`
      : `${API_URL}${path}`;

  /**
   * Код и отпечаток дописываются в момент нажатия, а не в разметке: cookie
   * доступны только в браузере, и рендер с ними разошёлся бы с серверным.
   * Без JS ссылка остаётся рабочей — просто без реферальной привязки.
   */
  function withCookies(event: MouseEvent<HTMLAnchorElement>) {
    const extra = new URLSearchParams();
    const ref = readCookie("vm_ref");
    if (ref) extra.set("ref", ref);
    const device = readCookie("vm_fp");
    if (device) extra.set("fp", device);
    if ([...extra.keys()].length === 0) return;

    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    extra.forEach((value, key) => url.searchParams.set(key, value));
    window.location.href = url.toString();
  }
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
          Первый вход создаёт аккаунт — отдельная регистрация не нужна.
        </p>

        {providers.length === 0 ? (
          <p className="rounded-xl border border-glass-brd bg-white/5 py-3 text-sm text-text-1">
            Вход временно недоступен. Попробуйте позже.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((id) => {
              const { label, path, Mark } = PROVIDERS[id];
              return (
                <a
                  key={id}
                  href={hrefFor(path)}
                  onClick={withCookies}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-white/10 border border-glass-brd py-3 text-sm font-medium text-text-0 transition hover:bg-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  <Mark />
                  {label}
                </a>
              );
            })}
          </div>
        )}

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
