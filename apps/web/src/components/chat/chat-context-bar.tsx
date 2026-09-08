"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import type { ChatConversationContext } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { contextBarState } from "./chat-context-status";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Шапка диалога, открытого по отклику в «Вакансиях»: карточка предложения
 * и статус отклика всегда на виду, а автор принимает решение не выходя из
 * переписки.
 *
 * Решение уходит в API «Вакансий» напрямую отсюда, а не через Чат: Чат не
 * проксирует чужие методы, он только показывает снимок из события. Свой
 * маленький запрос вместо клиента чужого сервиса — компоненты и клиенты
 * другого сервиса не импортируются, см. docs/service-module-contract.md.
 */
export function ChatContextBar({
  context,
  viewerId,
  onStatusChange,
}: {
  context: ChatConversationContext;
  viewerId: string;
  onStatusChange: (status: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = contextBarState(context, viewerId);

  const decide = async (status: "accepted" | "declined") => {
    // Статус меняется сразу, при ошибке возвращается.
    const before = context.status;
    onStatusChange(status);
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/vacancies/responses/${encodeURIComponent(context.id)}/status`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? "Не получилось");
      }
    } catch (e) {
      onStatusChange(before);
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-glass-brd bg-cyan/6 px-1 py-2">
      <Briefcase className="size-4 shrink-0 text-cyan" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-1">
          {state.kicker} · {state.statusLabel}
        </span>
        {state.offerHref ? (
          <Link
            href={state.offerHref}
            className="truncate text-xs text-text-0 underline"
          >
            {state.title}
          </Link>
        ) : (
          <span className="truncate text-xs text-text-0">{state.title}</span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red-400">
            {error}
          </span>
        )}
      </span>
      {state.canDecide && (
        <span className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("accepted")}
            className="rounded-lg border border-emerald-400/40 px-2.5 py-1 text-xs text-emerald-400 disabled:opacity-50"
          >
            Принять
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("declined")}
            className="rounded-lg border border-glass-brd px-2.5 py-1 text-xs text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Отклонить
          </button>
        </span>
      )}
    </div>
  );
}
