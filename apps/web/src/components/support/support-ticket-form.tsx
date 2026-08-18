"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateSupportTicketResponse,
  SupportTicketCategory,
} from "@vedamatch/shared";
import { ticketCategories, ticketCategoryLabels } from "@/lib/support-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Форма обращения. Гостю нужен контакт (email или Telegram), авторизованному —
 * нет: тикет привяжется к аккаунту и появится в кабинете.
 */
export function SupportTicketForm({ authorized }: { authorized: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("other");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactTelegram, setContactTelegram] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateSupportTicketResponse | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!authorized && !contactEmail.trim() && !contactTelegram.trim()) {
      setError("Оставьте email или Telegram — иначе мы не сможем ответить");
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/support/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          message,
          category,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactTelegram: contactTelegram.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | (CreateSupportTicketResponse & { message?: string })
        | null;
      if (!res.ok) {
        throw new Error(payload?.message ?? "Не удалось отправить обращение");
      }
      setCreated(payload as CreateSupportTicketResponse);
      setSubject("");
      setMessage("");
      if (authorized) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить обращение");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6">
        <h2 className="mb-2 font-display text-xl font-bold text-text-0">
          Обращение №{created.number} создано
        </h2>
        <p className="mb-4 text-sm text-text-1">
          Мы отвечаем в течение рабочего дня.{" "}
          {authorized
            ? "Ответ придёт в раздел «Поддержка» в вашем профиле."
            : "Сохраните ссылку ниже — по ней видно статус и ответы поддержки."}
        </p>
        {!authorized && (
          <p className="mb-4 break-all rounded-xl bg-bg-1 p-3 text-sm text-text-0">
            <Link
              href={`/support/track/${created.trackToken}`}
              className="underline"
            >
              /support/track/{created.trackToken}
            </Link>
          </p>
        )}
        <button
          type="button"
          onClick={() => setCreated(null)}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Создать ещё одно обращение
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="glass space-y-4 rounded-2xl border border-glass-brd p-6"
    >
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Тема
        </span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          maxLength={160}
          placeholder="Коротко о вопросе"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Категория
        </span>
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as SupportTicketCategory)
          }
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        >
          {ticketCategories.map((value) => (
            <option key={value} value={value}>
              {ticketCategoryLabels[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Сообщение
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          rows={6}
          maxLength={4000}
          placeholder="Опишите вопрос подробно: что делали, что ожидали, что произошло"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      {!authorized && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
              Как к вам обращаться
            </span>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              maxLength={160}
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
              Email для ответа
            </span>
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              maxLength={160}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
              или Telegram
            </span>
            <input
              value={contactTelegram}
              onChange={(event) => setContactTelegram(event.target.value)}
              maxLength={160}
              placeholder="@username"
              className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
            />
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_24px_rgba(255,62,158,0.45)] disabled:opacity-50"
      >
        {pending ? "Отправляем…" : "Отправить обращение"}
      </button>

      <p className="text-xs text-text-2">
        Отправляя обращение, вы соглашаетесь с{" "}
        <Link href="/legal/privacy" className="underline hover:text-text-1">
          Политикой конфиденциальности
        </Link>
        .
      </p>
    </form>
  );
}
