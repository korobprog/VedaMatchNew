"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Удаление ссылки автором или админом. Подтверждение спрашиваем прямо в
 * разметке, а не через window.confirm: тот выглядит чужеродно и не переводится.
 *
 * `onDeleted` передаёт лента, чтобы убрать карточку из уже подгруженного
 * списка; на странице записи его нет — там уходим на `redirectTo`.
 */
export function DeleteEntryButton({
  locale,
  entryId,
  onDeleted,
  redirectTo,
}: {
  locale: LibraryLocale;
  entryId: string;
  onDeleted?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/entries/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      // 404 — записи уже нет: для пользователя это тот же успешный итог.
      if (!res.ok && res.status !== 404) {
        setError(t(locale, "entry.deleteFailed"));
        return;
      }
      setConfirming(false);
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else if (!onDeleted) {
        router.refresh();
      }
    } catch {
      setError(t(locale, "entry.deleteFailed"));
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <div className="inline-flex flex-col">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          {t(locale, "entry.delete")}
        </button>
        {error && <span className="mt-1 text-xs text-magenta">{error}</span>}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-1">
        {t(locale, "entry.deleteConfirm")}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => void remove()}
        className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/40 disabled:opacity-50"
      >
        {pending ? t(locale, "entry.deleting") : t(locale, "entry.deleteConfirmYes")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded-xl px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
      >
        {t(locale, "entry.cancel")}
      </button>
      {error && <span className="text-xs text-magenta">{error}</span>}
    </div>
  );
}
