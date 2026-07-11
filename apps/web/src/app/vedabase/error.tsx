"use client";

import { useEffect } from "react";

export default function VedabaseError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-4 py-12">
      <section className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <h1 className="text-xl font-semibold text-red-900 dark:text-red-100">
          Не удалось загрузить Vedabase
        </h1>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          Проверьте подключение и повторите попытку. Скачанные книги останутся
          на устройстве.
        </p>
        <button
          type="button"
          onClick={unstable_retry}
          className="mt-5 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
        >
          Повторить
        </button>
      </section>
    </main>
  );
}
