"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminSupportTicketDto,
  SupportTicketStatus,
} from "@vedamatch/shared";
import {
  formatDateTime,
  subscriptionStatusLabels,
  ticketCategoryLabels,
  ticketStatusClasses,
  ticketStatusLabels,
  ticketStatuses,
} from "@/lib/support-labels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Разбор обращения: ответ пользователю, внутренняя заметка и смена статуса. */
export function AdminTicketDetail({ ticket }: { ticket: AdminSupportTicketDto }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [note, setNote] = useState(ticket.adminNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, body: unknown, method: "POST" | "PATCH") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${ticket.id}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось сохранить изменения");
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить изменения");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    const ok = await call("/messages", { body: reply, isInternal: internal }, "POST");
    if (ok) setReply("");
  }

  const contact = [
    ticket.contactName,
    ticket.contactEmail,
    ticket.contactTelegram,
  ]
    .filter(Boolean)
    .join(" · ");

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
            <dd className="text-text-1">{ticketCategoryLabels[ticket.category]}</dd>
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
                : "Ещё не отвечали"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Исполнитель</dt>
            <dd className="text-text-1">
              {ticket.assignedTo?.name ?? "Не назначен"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:col-span-2">
            <dt className="text-text-2">Автор</dt>
            <dd className="text-right text-text-1">
              {ticket.requester ? (
                <>
                  <Link
                    href={`/admin/users/${ticket.requester.id}`}
                    className="underline hover:text-text-0"
                  >
                    {ticket.requester.name}
                  </Link>{" "}
                  ({ticket.requester.email}) · подписка:{" "}
                  {subscriptionStatusLabels[ticket.requester.subscription.status]}
                  {ticket.requester.subscription.accessUntil &&
                    ` до ${formatDateTime(ticket.requester.subscription.accessUntil)}`}
                </>
              ) : (
                `Гость · ${contact || "контакты не указаны"}`
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {ticketStatuses
            .filter((value) => value !== ticket.status)
            .map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => void call("", { status: value }, "PATCH")}
                className="rounded-xl glass border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                {statusAction(value)}
              </button>
            ))}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void call("", { assignToMe: !ticket.assignedTo }, "PATCH")
            }
            className="rounded-xl glass border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            {ticket.assignedTo ? "Снять исполнителя" : "Взять на себя"}
          </button>
        </div>
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((message) => {
          const fromSupport = message.authorType === "admin";
          return (
            <li
              key={message.id}
              className={`rounded-2xl border p-4 ${
                fromSupport ? "border-cyan/30 bg-cyan/5" : "border-glass-brd bg-bg-1"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-text-0">
                  {fromSupport ? "Поддержка" : "Пользователь"}
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

      {ticket.internalMessages.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-2">
            Внутренние заметки
          </h2>
          <ol className="space-y-2">
            {ticket.internalMessages.map((message) => (
              <li
                key={message.id}
                className="rounded-xl border border-gold/30 bg-gold/5 p-3"
              >
                <p className="mb-1 text-xs text-text-2">
                  {formatDateTime(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-text-1">
                  {message.body}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <form
        onSubmit={send}
        className="glass space-y-3 rounded-2xl border border-glass-brd p-4"
      >
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Ответ
          </span>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={5}
            maxLength={4000}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={internal}
            onChange={(event) => setInternal(event.target.checked)}
          />
          Внутренняя заметка (пользователь не увидит)
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || !reply.trim()}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Отправляем…" : internal ? "Сохранить заметку" : "Ответить"}
        </button>
      </form>

      <div className="glass space-y-3 rounded-2xl border border-glass-brd p-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Служебная пометка к тикету
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={4000}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => void call("", { adminNote: note }, "PATCH")}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Сохранить пометку
        </button>
      </div>
    </div>
  );
}

function statusAction(status: SupportTicketStatus): string {
  switch (status) {
    case "open":
      return "Вернуть в новые";
    case "in_progress":
      return "В работу";
    case "waiting_user":
      return "Ждём пользователя";
    case "resolved":
      return "Решено";
    case "closed":
      return "Закрыть";
  }
}
