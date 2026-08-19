"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Отличает недоступный API от прочих поломок.
 *
 * Страницы портала грузят данные прямо в серверном компоненте, и когда API
 * недоступен — перезапуск, деплой, сетевая икота — `fetch` отклоняется
 * `TypeError: fetch failed`. Пользователю в этом случае надо сказать «попробуйте
 * позже», а не «что-то пошло не так»: ошибка не его и пройдёт сама.
 */
export function isBackendUnreachable(error: Error): boolean {
  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("network")
  );
}

export default function PortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("Common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  const offline = isBackendUnreachable(error);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <section className="glass w-full rounded-2xl border border-glass-brd p-6 text-center sm:p-8">
        <h1 className="text-xl font-semibold text-text-0 sm:text-2xl">
          {offline ? t("errorPage.offlineTitle") : t("errorPage.title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-1">
          {offline ? t("errorPage.offlineDescription") : t("errorPage.description")}
        </p>
        {error.digest && (
          // Код нужен поддержке, чтобы найти именно этот случай в логах.
          <p className="mt-3 font-mono text-xs text-text-2">
            {t("errorPage.code", { digest: error.digest })}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={unstable_retry}
            className="btn-mint rounded-full px-5 py-2.5 text-sm font-medium"
          >
            {t("retry")}
          </button>
          <Link
            href="/"
            className="rounded-full border border-glass-brd px-5 py-2.5 text-sm font-medium text-text-1 hover:text-text-0"
          >
            {t("backHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
