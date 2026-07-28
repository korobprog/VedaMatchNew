"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserReportReason } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const reasonLabels: Record<UserReportReason, string> = {
  spam: "Спам или реклама",
  harassment: "Оскорбления, домогательства",
  fake_profile: "Фейковый профиль",
  inappropriate_content: "Недопустимый контент",
  offline_safety: "Небезопасное поведение вне сервиса",
  other: "Другое",
};

/** Пожаловаться на человека или скрыть его из знакомств навсегда. */
export function ReportBlockMenu({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<UserReportReason>("spam");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(path: string, init: RequestInit) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Действие не выполнено");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function block() {
    const ok = await send(`/union/users/${userId}/block`, { method: "POST" });
    if (ok) router.refresh();
  }

  async function report(event: React.FormEvent) {
    event.preventDefault();
    const ok = await send(`/union/users/${userId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason, comment: comment.trim() || null }),
    });
    if (!ok) return;
    setReportOpen(false);
    setOpen(false);
    setComment("");
    setDone("Жалоба отправлена — администрация её рассмотрит.");
  }

  if (done) {
    return <p className="text-xs text-text-2">{done}</p>;
  }

  return (
    <div className="text-xs">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-text-2 transition hover:text-text-1"
        >
          Пожаловаться или заблокировать
        </button>
      ) : (
        <div className="space-y-2">
          {!reportOpen ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="text-text-1 underline transition hover:text-text-0"
              >
                Пожаловаться
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={block}
                className="text-red-500 underline transition hover:text-red-400 disabled:opacity-50"
              >
                {pending ? "Блокируем..." : "Заблокировать"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-text-2 transition hover:text-text-1"
              >
                Отмена
              </button>
            </div>
          ) : (
            <form onSubmit={report} className="space-y-2">
              <p className="text-text-2">Жалоба на {userName}</p>
              <select
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as UserReportReason)
                }
                aria-label="Причина жалобы"
                className="w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-xs text-text-0"
              >
                {(
                  Object.keys(reasonLabels) as UserReportReason[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {reasonLabels[value]}
                  </option>
                ))}
              </select>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Что произошло? (по желанию)"
                aria-label="Комментарий к жалобе"
                className="w-full rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-xs text-text-0"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-magenta px-3 py-1.5 font-medium text-white disabled:opacity-50"
                >
                  {pending ? "Отправка..." : "Отправить"}
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="text-text-2 transition hover:text-text-1"
                >
                  Назад
                </button>
              </div>
            </form>
          )}
          {error && <p className="text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
