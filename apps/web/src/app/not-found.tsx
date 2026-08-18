import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Страница не найдена — VedaMatch",
  robots: { index: false },
};

/** 404 портала — раньше показывалась стандартная английская страница Next. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center px-4 py-12">
      <section className="glass w-full rounded-3xl p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-text-2">
          404
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-text-1">
          Такой страницы нет
        </h1>
        <p className="mt-3 text-sm text-text-2">
          Возможно, объявление сняли, ссылка устарела или в адресе опечатка.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-magenta px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            На главную
          </Link>
          <Link
            href="/support"
            className="rounded-full border border-glass-brd px-5 py-2.5 text-sm font-medium text-text-1 transition hover:bg-glass"
          >
            Поддержка
          </Link>
        </div>
      </section>
    </main>
  );
}
