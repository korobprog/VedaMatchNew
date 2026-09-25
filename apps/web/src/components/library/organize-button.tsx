"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ListTree } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
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
}: {
  locale: LibraryLocale;
  className?: string;
}) {
  const organizing = useSyncExternalStore(
    subscribeOrganizing,
    getOrganizing,
    getOrganizingServer,
  );
  // Ушли со страницы — режим не должен ждать на следующей.
  useEffect(() => () => setOrganizing(false), []);

  return (
    <button
      type="button"
      onClick={() => setOrganizing(!organizing)}
      aria-pressed={organizing}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-glass-brd px-3 text-sm text-text-2 hover:text-text-0 ${className}`}
    >
      <ListTree aria-hidden className="size-4 shrink-0" />
      {t(locale, organizing ? "tree.done" : "tree.organize")}
    </button>
  );
}
