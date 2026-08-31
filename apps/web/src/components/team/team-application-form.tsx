"use client";

import { useState } from "react";
import type {
  CreateTeamApplicationResponse,
  TeamApplicationRole,
} from "@vedamatch/shared";
import { teamRoleLabels, teamRoles } from "@/lib/team-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Форма заявки: кандидат всегда гость, контакт (email или Telegram) обязателен. */
export function TeamApplicationForm() {
  const [role, setRole] = useState<TeamApplicationRole>("security");
  const [roleOther, setRoleOther] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactTelegram, setContactTelegram] = useState("");
  const [message, setMessage] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateTeamApplicationResponse | null>(
    null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!contactEmail.trim() && !contactTelegram.trim()) {
      setError("Оставьте email или Telegram — иначе мы не сможем ответить");
      return;
    }
    if (role === "other" && !roleOther.trim()) {
      setError("Опишите роль, если её нет в списке");
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/team/applications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          roleOther: role === "other" ? roleOther.trim() : null,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactTelegram: contactTelegram.trim() || null,
          message,
          portfolioUrl: portfolioUrl.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | (CreateTeamApplicationResponse & { message?: string })
        | null;
      if (!res.ok) {
        throw new Error(payload?.message ?? "Не удалось отправить заявку");
      }
      setCreated(payload as CreateTeamApplicationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить заявку");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6">
        <h2 className="mb-2 font-display text-xl font-bold text-text-0">
          Заявка отправлена
        </h2>
        <p className="text-sm text-text-1">
          Спасибо! Мы свяжемся с вами по указанному контакту.
        </p>
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
          Роль
        </span>
        <select
          value={role}
          onChange={(event) =>
            setRole(event.target.value as TeamApplicationRole)
          }
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        >
          {teamRoles.map((value) => (
            <option key={value} value={value}>
              {teamRoleLabels[value]}
            </option>
          ))}
        </select>
      </label>

      {role === "other" && (
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Какая роль
          </span>
          <input
            value={roleOther}
            onChange={(event) => setRoleOther(event.target.value)}
            maxLength={160}
            placeholder="Например, продюсер контента"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Расскажите о себе
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          rows={6}
          maxLength={4000}
          placeholder="Опыт, чем можете помочь, сколько времени готовы уделять"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Портфолио или профиль (необязательно)
        </span>
        <input
          type="url"
          value={portfolioUrl}
          onChange={(event) => setPortfolioUrl(event.target.value)}
          maxLength={300}
          placeholder="https://github.com/you"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_24px_rgba(255,62,158,0.45)] disabled:opacity-50"
      >
        {pending ? "Отправляем…" : "Отправить заявку"}
      </button>

      <p className="text-xs text-text-2">
        Отправляя заявку, вы соглашаетесь с{" "}
        <a href="/legal/privacy" className="underline hover:text-text-1">
          Политикой конфиденциальности
        </a>
        .
      </p>
    </form>
  );
}
