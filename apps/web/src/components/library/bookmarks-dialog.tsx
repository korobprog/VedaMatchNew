"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  bookmarkLinks,
  type BookmarkLink,
  type LibraryBookmarkListResponse,
} from "./bookmarks-list";
import { LIBRARY_ICON_BUTTON } from "./icon-button";
import { t } from "./i18n";

const API_URL = apiBase();

type State =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; links: BookmarkLink[] };

/**
 * «Закладки» (VED-539): значок в ряду действий рубрики и на главной
 * Образования. Открывает окно со всеми материалами Образования, отмеченными
 * закладкой, — полными названиями со ссылками. Окно того же вида, что выбор
 * рубрики в «Упорядочить»: шторка снизу на телефоне, диалог по центру шире.
 *
 * Список спрашивается при каждом открытии: закладку могли поставить или
 * снять на соседней карточке, и прежний ответ был бы уже неверным.
 */
export function LibraryBookmarksDialog({
  locale,
  className = "",
}: {
  locale: LibraryLocale;
  /** Место в ряду, например `ml-auto`. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "loading" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const label = t(locale, "bookmarks.open");

  const close = useCallback(() => {
    setOpen(false);
    // Фокус — обратно на значок: иначе после Esc он уходил бы в начало
    // страницы, и клавиатура теряла место.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    closeRef.current?.focus();
    apiFetch(`${API_URL}/library/bookmarks`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as LibraryBookmarkListResponse;
        if (!cancelled) {
          setState({ kind: "ready", links: bookmarkLinks(locale, body.items) });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setState({ kind: "loading" });
          setOpen(true);
        }}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${LIBRARY_ICON_BUTTON} border-glass-brd text-text-1 hover:text-text-0 ${className}`}
      >
        <Bookmark aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-bookmarks-title"
            className="glass max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl border border-glass-brd p-4 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="library-bookmarks-title"
                className="font-display text-base font-semibold text-text-0"
              >
                {t(locale, "bookmarks.dialog")}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label={t(locale, "bookmarks.close")}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-text-2 hover:text-text-0"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            {state.kind === "ready" && state.links.length > 0 ? (
              <ul className="flex flex-col divide-y divide-glass-brd">
                {state.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 py-2 text-sm text-text-0 hover:bg-bg-2"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="px-3 py-3 text-sm text-text-2">
                {state.kind === "loading"
                  ? t(locale, "bookmarks.loading")
                  : state.kind === "failed"
                    ? t(locale, "bookmarks.failed")
                    : t(locale, "bookmarks.empty")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
