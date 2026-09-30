"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { blogFeedHref, type BlogFeedFilterValues } from "./blog-feed-filters";

/**
 * Поиск по Блог-ленте (VED-687): по содержанию и по автору; по духовной
 * линии — фильтр рядом в том же ряду. Обычная GET-форма: выбор живёт в
 * адресе, как и остальные фильтры ленты, и ссылку на поиск можно переслать.
 */
export function BlogSearchForm({ filters }: { filters: BlogFeedFilterValues }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const keep = ["view", "category", "lineage"] as const;
  const field =
    "min-h-11 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 text-sm text-text-0";

  return (
    <form
      role="search"
      aria-label="Поиск по блог-ленте"
      action={pathname}
      className="glass mb-4 flex flex-col gap-3 rounded-2xl border border-glass-brd p-3 sm:flex-row sm:items-end"
    >
      {keep.map((key) => {
        const value = search.get(key);
        return value ? (
          <input key={key} type="hidden" name={key} value={value} />
        ) : null;
      })}
      <label className="flex flex-grow flex-col gap-1 text-xs text-text-1">
        По содержанию
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          key={`q:${filters.q ?? ""}`}
          minLength={2}
          maxLength={100}
          placeholder="Слово или фраза"
          className={field}
        />
      </label>
      <label className="flex flex-grow flex-col gap-1 text-xs text-text-1">
        По автору
        <input
          type="search"
          name="author"
          defaultValue={filters.author ?? ""}
          key={`author:${filters.author ?? ""}`}
          minLength={2}
          maxLength={100}
          placeholder="Имя автора"
          className={field}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 text-sm font-semibold text-white"
        >
          Найти
        </button>
        {(filters.q || filters.author) && (
          <Link
            href={blogFeedHref(pathname, search.toString(), {
              q: null,
              author: null,
            })}
            className="inline-flex min-h-11 items-center rounded-xl border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0"
          >
            Сбросить
          </Link>
        )}
      </div>
    </form>
  );
}
