"use client";

import { useState } from "react";
import type { VacancyReportReason } from "@vedamatch/shared";
import { VacanciesApiError, reportVacancy } from "@/lib/vacancies-api";
import { VACANCY_REPORT_REASON_LABELS } from "./vacancy-labels";

/** Жалоба на предложение. Раскрывается по кнопке, чтобы не давить на глаз. */
export function VacancyReportDialog({ offerId }: { offerId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<VacancyReportReason>("spam");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done)
    return <p className="text-xs text-text-2">Спасибо, жалоба у модератора.</p>;

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-text-2 underline hover:text-text-1"
      >
        Пожаловаться
      </button>
    );

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await reportVacancy(offerId, { reason, note: note.trim() || null });
      setDone(true);
    } catch (e) {
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="vacancy-report-reason" className="block text-xs text-text-2">
        Что не так
      </label>
      <select
        id="vacancy-report-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value as VacancyReportReason)}
        className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
      >
        {(
          Object.entries(VACANCY_REPORT_REASON_LABELS) as Array<
            [VacancyReportReason, string]
          >
        ).map(([value, label]) => (
          <option key={value} value={value} className="bg-bg-0">
            {label}
          </option>
        ))}
      </select>
      <textarea
        rows={2}
        value={note}
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Подробности, если есть"
        aria-label="Подробности жалобы"
        className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Отправить
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-text-2 underline"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
