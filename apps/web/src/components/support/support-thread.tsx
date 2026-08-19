"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportTicketDto } from "@vedamatch/shared";
import {
  formatDateTime,
  ticketCategoryLabels,
  ticketStatusClasses,
  ticketStatusLabels,
} from "@/lib/support-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Переписка по обращению. Один компонент для кабинета и для гостевой ссылки —
 * различается только эндпоинт отправки ответа.
 */
export function SupportThread({
  ticket,
  mode,
  token,
}: {
  ticket: SupportTicketDto;
  mode: "my" | "track";
  token?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = ticket.status === "closed";

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const url =
        mode === "my"
          ? `${API_URL}/support/my/tickets/${ticket.id}/messages`
          : `${API_URL}/support/tickets/track/${token}/messages`;
      const res = await apiFetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось отправить сообщение");
      }
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить сообщение");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl border border-glass-brd p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-2">Обращение №{ticket.number}</p>
            <h1 className="font-display text-xl font-bold text-text-0">
              {ticket.subject}
            </h1>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${ticketStatusClasses[ticket.status]}`}
          >
            {ticketStatusLabels[ticket.status]}
          </span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Категория</dt>
            <dd className="text-text-1">
              {ticketCategoryLabels[ticket.category]}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Создано</dt>
            <dd className="text-text-1">{formatDateTime(ticket.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Первый ответ</dt>
            <dd className="text-text-1">
              {ticket.firstResponseAt
                ? formatDateTime(ticket.firstResponseAt)
                : "Ожидается"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Последнее сообщение</dt>
            <dd className="text-text-1">
              {formatDateTime(ticket.lastMessageAt)}
            </dd>
          </div>
        </dl>
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((message) => {
          const fromSupport = message.authorType === "admin";
          return (
            <li
              key={message.id}
              className={`rounded-2xl border p-4 ${
                fromSupport
                  ? "border-cyan/30 bg-cyan/5"
                  : "border-glass-brd bg-bg-1"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-text-0">
                  {fromSupport ? "Поддержка VedaMatch" : "Вы"}
                </span>
                <span className="text-xs text-text-2">
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-text-1">
                {message.body}
              </p>
            </li>
          );
        })}
      </ol>

      {closed ? (
        <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
          Обращение закрыто. Если вопрос вернулся — создайте новое.
        </p>
      ) : (
        <form
          onSubmit={send}
          className="glass space-y-3 rounded-2xl border border-glass-brd p-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
              Ваше сообщение
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Отправляем…" : "Отправить"}
          </button>
        </form>
      )}
    </div>
  );
}
