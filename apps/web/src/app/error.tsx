"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Глобальный error boundary портала. До него любая ошибка серверного
 * рендера (упавший API на главной, 500 из сервиса) показывала белую
 * страницу Next без темы и языка. Здесь — тот же glass-стиль и кнопка
 * «Повторить», которая перерендерит сегмент без перезагрузки.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center px-4 py-12">
      <section className="glass w-full rounded-3xl p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-text-2">
          Ошибка
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-text-1">
          Что-то пошло не так
        </h1>
        <p className="mt-3 text-sm text-text-2">
          Сервис временно недоступен или произошла ошибка. Попробуйте ещё раз —
          если не помогает, напишите в поддержку.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-text-2/70">
            код: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-magenta px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Повторить
          </button>
          <Link
            href="/"
            className="rounded-full border border-glass-brd px-5 py-2.5 text-sm font-medium text-text-1 transition hover:bg-glass"
          >
            На главную
          </Link>
          <Link
            href="/support"
            className="text-sm text-text-2 underline-offset-4 hover:underline"
          >
            Поддержка
          </Link>
        </div>
      </section>
    </main>
  );
}
