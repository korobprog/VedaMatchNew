"use client";

import { useEffect } from "react";
import Link from "next/link";

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  const offline = isBackendUnreachable(error);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4 py-12">
      <section className="glass w-full rounded-2xl border border-glass-brd p-6 text-center sm:p-8">
        <h1 className="text-xl font-semibold text-text-0 sm:text-2xl">
          {offline ? "Сервис сейчас недоступен" : "Страница не открылась"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-1">
          {offline
            ? "Похоже, сервер обновляется или потерялась связь. Данные не пропали — попробуйте обновить страницу через минуту."
            : "Мы записали ошибку и разберёмся. Попробуйте повторить или вернуться на главную."}
        </p>
        {error.digest && (
          // Код нужен поддержке, чтобы найти именно этот случай в логах.
          <p className="mt-3 font-mono text-xs text-text-2">
            Код ошибки: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={unstable_retry}
            className="btn-mint rounded-full px-5 py-2.5 text-sm font-medium"
          >
            Повторить
          </button>
          <Link
            href="/"
            className="rounded-full border border-glass-brd px-5 py-2.5 text-sm font-medium text-text-1 hover:text-text-0"
          >
            На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
