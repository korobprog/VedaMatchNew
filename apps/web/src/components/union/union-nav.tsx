import Link from "next/link";

export function UnionNav({ incomingPending }: { incomingPending: number }) {
  return (
    <nav aria-label="Навигация Union" className="mb-6 flex flex-wrap gap-2">
      <Link
        href="/union"
        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-300 hover:text-amber-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-800 dark:hover:text-amber-400"
      >
        Профиль
      </Link>
      <Link
        href="/union/recommendations"
        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-300 hover:text-amber-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-800 dark:hover:text-amber-400"
      >
        Рекомендации
      </Link>
      <Link
        href="/union/connections"
        className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-300 hover:text-amber-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-800 dark:hover:text-amber-400"
      >
        Связи
        {incomingPending > 0 && (
          <span
            aria-label={`Входящих заявок: ${incomingPending}`}
            className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            {incomingPending}
          </span>
        )}
      </Link>
    </nav>
  );
}
