"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { NoticeReportReason } from "@vedamatch/shared";
import { NoticesApiError, reportNotice } from "@/lib/notices-api";

const REASONS: Array<[NoticeReportReason, string]> = [
  ["commercial", "Это коммерция — здесь ей не место"],
  ["spam", "Спам"],
  ["mlm", "Сетевой маркетинг"],
  ["duplicate", "Дубль другого объявления"],
  ["scam", "Похоже на обман"],
  ["inappropriate_content", "Неуместное содержание"],
  ["wrong_rubric", "Не та рубрика"],
  ["other", "Другое"],
];

export function NoticeReportDialog({ noticeId }: { noticeId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<NoticeReportReason>("commercial");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reportNotice(noticeId, { reason, note: note || null });
      setDone(true);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <p className="text-sm text-text-2">
        Спасибо, жалоба ушла модератору.
      </p>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-text-2 transition hover:text-red-400"
      >
        <Flag className="size-4" />
        Пожаловаться
      </button>
    );

  return (
    <form onSubmit={submit} className="rounded-xl border border-glass-brd p-4">
      <p className="mb-3 text-sm font-medium text-text-0">Что не так?</p>
      <div className="space-y-1">
        {REASONS.map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-sm text-text-1"
          >
            <input
              type="radio"
              name="reason"
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Пояснение (необязательно)"
        className="mt-3 w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
      />
      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-400 disabled:opacity-50"
        >
          Отправить
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-glass-brd px-3 py-1.5 text-sm text-text-1"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
