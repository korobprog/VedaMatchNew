"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Check, ListTree } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";
import {
  getOrganizing,
  getOrganizingServer,
  setOrganizing,
  subscribeOrganizing,
} from "./organize-state";

/** Кнопка «Упорядочить» в ряду кнопок Образования (VED-483). */
export function LibraryOrganizeButton({
  locale,
  className = "",
  iconOnly = false,
}: {
  locale: LibraryLocale;
  className?: string;
  /** Значком, без подписи на экране (VED-511) — ряд действий рубрики. */
  iconOnly?: boolean;
}) {
  const organizing = useSyncExternalStore(
    subscribeOrganizing,
    getOrganizing,
    getOrganizingServer,
  );
  // Ушли со страницы — режим не должен ждать на следующей.
  useEffect(() => () => setOrganizing(false), []);

  const label = t(locale, organizing ? "tree.done" : "tree.organize");

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setOrganizing(!organizing)}
        aria-pressed={organizing}
        aria-label={t(locale, "tree.organize")}
        title={label}
        className={`${LIBRARY_ICON_BUTTON} ${
          organizing
            ? "border-magenta text-text-0"
            : "border-glass-brd text-text-2 hover:text-text-0"
        } ${className}`}
      >
        {organizing ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <ListTree aria-hidden className="size-4" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOrganizing(!organizing)}
      aria-pressed={organizing}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-glass-brd px-3 text-sm text-text-2 hover:text-text-0 ${className}`}
    >
      <ListTree aria-hidden className="size-4 shrink-0" />
      {label}
    </button>
  );
}
