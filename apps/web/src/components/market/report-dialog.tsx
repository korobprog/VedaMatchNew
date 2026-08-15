"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  MarketReportReason,
  MarketReportTargetKind,
} from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const REASONS: MarketReportReason[] = [
  "spam",
  "prohibited_item",
  "scam",
  "wrong_category",
  "inappropriate_content",
  "other",
];

/**
 * Кнопка жалобы с раскрывающейся формой. Не модальное окно: жалуются редко,
 * а модалка требует ловушки фокуса и обработки Escape ради одного поля.
 */
export function ReportButton({
  targetKind,
  targetId,
  className,
}: {
  targetKind: MarketReportTargetKind;
  targetId: string;
  className?: string;
}) {
  const t = useTranslations("Market");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<MarketReportReason>("spam");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind,
          targetId,
          reason,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      setSent(true);
      setOpen(false);
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return <span className="text-xs text-text-2">{t("report.sent")}</span>;
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-magenta"
      >
        <Flag aria-hidden className="h-3 w-3" />
        {t("report.action")}
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="glass mt-2 rounded-2xl border border-glass-brd p-3"
        >
          <label className="mb-2 block text-xs">
            <span className="mb-1 block text-text-2">{t("report.reason")}</span>
            <select
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as MarketReportReason)
              }
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0"
            >
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`report.reasons.${value}`)}
                </option>
              ))}
            </select>
          </label>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("report.note")}
            rows={2}
            maxLength={1000}
            className="mb-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-1.5 text-sm text-text-0 placeholder:text-text-2"
          />

          <p className="mb-2 text-[11px] text-text-2">{t("report.hint")}</p>

          {error && (
            <p className="mb-2 text-xs text-magenta">
              {marketErrorText(t, error)}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl border border-magenta/40 px-3 py-1.5 text-xs text-magenta hover:bg-magenta/10 disabled:opacity-50"
            >
              {t("report.submit")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs text-text-2 hover:text-text-0"
            >
              {t("report.cancel")}
            </button>
          </div>
        </form>
      )}
    </span>
  );
}
