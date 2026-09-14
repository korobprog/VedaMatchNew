"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ChatOfficialChannelStats,
  ChatOfficialChannelSyncResult,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { API_URL, apiFetch } from "@/lib/http-client";
import { plural } from "@/lib/plural";

/**
 * Официальный канал VedaMatch: один на портал, в нём все участники. Писать
 * могут администраторы портала прямо из беседы. Здесь сводка и досинхронизация
 * тех, кого канал почему-то не застал. Вышедших сами обратно не добавляем.
 */
export function AdminOfficialChannelView({
  initial,
}: {
  initial: ChatOfficialChannelStats | null;
}) {
  const [stats, setStats] = useState<ChatOfficialChannelStats | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!stats) {
    return (
      <Alert tone="error">
        Не удалось загрузить канал. Возможно, миграция с каналом ещё не накачена.
      </Alert>
    );
  }

  async function syncMembers() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/chat/official/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Подписать не получилось");
      const next = (await res.json()) as ChatOfficialChannelSyncResult;
      setStats(next);
      setNotice(
        next.added > 0
          ? `Подписали ${next.added} ${plural(next.added, "участника", "участников", "участников")}`
          : "Все участники уже в канале",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Подписать не получилось");
    } finally {
      setBusy(false);
    }
  }

  const figures: Array<{ label: string; value: number }> = [
    { label: "Подписчики", value: stats.subscribers },
    { label: "С уведомлениями", value: stats.notificationsOn },
    { label: "Вышли сами", value: stats.left },
    { label: "Не подписаны", value: stats.missing },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-glass-brd bg-glass p-4">
        <h2 className="font-display text-base font-semibold text-text-0">
          {stats.title}
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Новые участники подписываются при регистрации, уведомления у них
          выключены, пока человек не включит их сам.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2"
            >
              <dt className="hyphens-auto break-words text-xs text-text-1">{figure.label}</dt>
              <dd className="font-mono text-xl text-text-0">{figure.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/chat/${encodeURIComponent(stats.conversationId)}`}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Открыть канал
          </Link>
          <button
            type="button"
            onClick={() => void syncMembers()}
            disabled={busy || stats.missing === 0}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            {busy ? "Подписываем…" : "Подписать всех, кого нет"}
          </button>
        </div>
        {notice && (
          <p role="status" className="mt-2 text-sm text-text-1">
            {notice}
          </p>
        )}
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
      </section>
    </div>
  );
}
