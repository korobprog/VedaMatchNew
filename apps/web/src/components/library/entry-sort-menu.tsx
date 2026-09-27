"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownAZ, ArrowUpDown } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { useDismissable } from "@/lib/use-dismissable";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";

/** Значение `?sort=` для «По алфавиту». «Свой порядок» — без параметра. */
export const ENTRY_SORT_TITLE = "title";

/**
 * Адрес ленты с выбранным порядком: «По алфавиту» — `?sort=title`, «Свой
 * порядок» — без `sort`. Курсор сбрасывается: он от другой выдачи.
 */
export function entrySortHref(
  pathname: string,
  params: URLSearchParams,
  alphabetical: boolean,
): string {
  const next = new URLSearchParams(params.toString());
  if (alphabetical) next.set("sort", ENTRY_SORT_TITLE);
  else next.delete("sort");
  next.delete("cursor");
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * «Упорядочить» на странице автора (VED-573) — меню для всех, админов
 * тоже: «Свой порядок» (как лента стоит по умолчанию) или «По алфавиту»,
 * по названию материала. Раньше здесь был админский режим перетаскивания
 * рубрик — на странице автора он был не к месту; на страницах разделов и в
 * админке он остался.
 *
 * Меню раскрывается у правого края ряда действий — ряд `relative`, как у
 * «Типа материала».
 */
export function EntrySortMenu({ locale }: { locale: LibraryLocale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const alphabetical = params.get("sort") === ENTRY_SORT_TITLE;
  const label = t(locale, "tree.organize");
  const chosen = t(locale, alphabetical ? "sort.title" : "sort.custom");

  function choose(next: boolean) {
    setOpen(false);
    if (next === alphabetical) return;
    router.push(entrySortHref(pathname, params, next), { scroll: false });
  }

  const optionClass = (pressed: boolean) =>
    `flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
      pressed
        ? "bg-magenta/10 font-semibold text-text-0"
        : "text-text-1 hover:bg-bg-1 hover:text-text-0"
    }`;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${chosen}`}
        title={`${label}: ${chosen}`}
        onClick={() => setOpen((value) => !value)}
        className={`${LIBRARY_ICON_BUTTON} ${
          alphabetical
            ? "border-magenta text-text-0"
            : "border-glass-brd text-text-1 hover:text-text-0"
        }`}
      >
        {alphabetical ? (
          <ArrowDownAZ aria-hidden className="size-4" />
        ) : (
          <ArrowUpDown aria-hidden className="size-4" />
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="group"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          <p className="px-3 pb-1 text-xs text-text-2">{label}</p>
          <button
            type="button"
            aria-pressed={!alphabetical}
            onClick={() => choose(false)}
            className={optionClass(!alphabetical)}
          >
            {t(locale, "sort.custom")}
          </button>
          <button
            type="button"
            aria-pressed={alphabetical}
            onClick={() => choose(true)}
            className={optionClass(alphabetical)}
          >
            {t(locale, "sort.title")}
          </button>
        </div>
      )}
    </div>
  );
}
