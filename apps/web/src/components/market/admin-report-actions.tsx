"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Разбор жалобы. Две кнопки, а не выпадающий список: у модератора всего два
 * исхода — жалоба обоснована (скрыть) или нет (вернуть объект и закрыть все
 * жалобы на него).
 */
export function AdminReportActions({ reportId }: { reportId: string }) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(status: "reviewed" | "dismissed", hideTarget: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/market/admin/reports/${reportId}/resolve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            hideTarget,
            moderatorNote: note.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-glass-brd pt-3">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("admin.moderatorNote")}
        maxLength={1000}
        className="mb-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-1.5 text-sm text-text-0 placeholder:text-text-2"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void resolve("reviewed", true)}
          className="rounded-xl border border-magenta/40 px-3 py-1.5 text-sm text-magenta hover:bg-magenta/10 disabled:opacity-50"
        >
          {t("admin.confirm")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void resolve("dismissed", false)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
        >
          {t("admin.dismiss")}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
