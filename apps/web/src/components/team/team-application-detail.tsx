"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamApplicationDto } from "@vedamatch/shared";
import {
  formatDateTime,
  teamRoleLabels,
  teamStatusLabels,
  teamStatuses,
} from "@/lib/team-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Разбор заявки: смена статуса и служебная пометка. */
export function TeamApplicationDetail({
  application,
}: {
  application: TeamApplicationDto;
}) {
  const router = useRouter();
  const [note, setNote] = useState(application.adminNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/team/applications/${application.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось сохранить изменения");
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить изменения",
      );
    } finally {
      setPending(false);
    }
  }

  const contact = [
    application.contactName,
    application.contactEmail,
    application.contactTelegram,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl border border-glass-brd p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-2">
              {teamRoleLabels[application.role]}
              {application.role === "other" && application.roleOther
                ? ` · ${application.roleOther}`
                : ""}
            </p>
            <h1 className="font-display text-xl font-bold text-text-0">
              {contact || "Контакты не указаны"}
            </h1>
          </div>
          <span className="rounded-full border border-glass-brd px-3 py-1 text-xs font-semibold text-text-1">
            {teamStatusLabels[application.status]}
          </span>
        </div>

        <p className="mb-2 text-sm text-text-2">
          Создано {formatDateTime(application.createdAt)}
        </p>
        {application.portfolioUrl && (
          <p className="mb-2 text-sm text-text-1">
            Портфолио:{" "}
            <a
              href={application.portfolioUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text-0"
            >
              {application.portfolioUrl}
            </a>
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-text-1">
          {application.message}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {teamStatuses
            .filter((value) => value !== application.status)
            .map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => void call({ status: value })}
                className="rounded-xl glass border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                {teamStatusLabels[value]}
              </button>
            ))}
        </div>
      </header>

      <div className="glass space-y-3 rounded-2xl border border-glass-brd p-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Служебная пометка
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => void call({ adminNote: note })}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Сохранить пометку
        </button>
      </div>
    </div>
  );
}
