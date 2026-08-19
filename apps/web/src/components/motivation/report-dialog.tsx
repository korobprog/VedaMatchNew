"use client";

import { FormEvent, useRef, useState } from "react";
import {
  MOTIVATION_REPORT_REASONS,
  type MotivationReportReason,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Пожаловаться» на рилс участника. Жалоба одна на человека: повторное
 * открытие ничего не накрутит, поэтому после отправки показываем спокойное
 * «спасибо», а не счётчик.
 */
export function ReportDialog({ postId, className }: { postId: string; className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<MotivationReportReason>("spam");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_URL}/motivation/posts/${postId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment: comment.trim() || null }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не отправилось");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={className ?? "underline-offset-4 hover:underline"}
      >
        Пожаловаться
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="report-title"
        className="m-auto w-[min(92vw,26rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
      >
        {sent ? (
          <form method="dialog" className="p-6 text-left">
            <h2 id="report-title" className="font-display text-lg font-bold">
              Спасибо, мы посмотрим
            </h2>
            <p className="mt-2 text-sm text-text-1">
              Жалоба ушла администратору. Если таких обращений наберётся несколько, рилс скроется из
              ленты до решения.
            </p>
            <button className="btn-mint mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold">
              Закрыть
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="p-6 text-left">
            <h2 id="report-title" className="font-display text-lg font-bold">
              Что не так с этим рилсом?
            </h2>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Причина жалобы</legend>
              {MOTIVATION_REPORT_REASONS.map((item) => (
                <label key={item.value} className="flex items-center gap-2 text-sm text-text-1">
                  <input
                    type="radio"
                    name="reason"
                    value={item.value}
                    checked={reason === item.value}
                    onChange={() => setReason(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-3 block text-sm text-text-1">
              Комментарий (необязательно)
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
            </label>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-500">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="btn-mint flex-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {pending ? "Отправляем…" : "Отправить"}
              </button>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    return message || `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
}
