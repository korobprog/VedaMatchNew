"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AdminChatConversationDto,
  AdminChatConversationsState,
  AdminChatReportDto,
  AdminChatReportsState,
  AdminChatStats,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Раздел админки сервиса «Общение»: разбор жалоб и общая статистика.
 * Решение «скрыть» прячет само сообщение — беседу целиком не трогаем:
 * из-за одной грубости переписка двух людей исчезать не должна.
 */
export function AdminChatView({
  initial,
  stats,
  initialConversations,
}: {
  initial: AdminChatReportsState;
  stats: AdminChatStats | null;
  initialConversations: AdminChatConversationsState;
}) {
  const [reports, setReports] = useState(initial.reports);
  const [conversations, setConversations] = useState(
    initialConversations.conversations,
  );
  const [query, setQuery] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(report: AdminChatReportDto, action: "resolve" | "reject") {
    setBusyId(report.id);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/chat/reports/${report.id}/decide`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setReports((current) => current.filter((r) => r.id !== report.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Решение не сохранилось");
    } finally {
      setBusyId(null);
    }
  }

  // Поиск беседы: пауза после набора, чтобы не слать запрос на каждую букву.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void apiFetch(
        `${API_URL}/admin/chat/conversations?q=${encodeURIComponent(query.trim())}`,
        { credentials: "include" },
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data: AdminChatConversationsState | null) => {
          if (data) setConversations(data.conversations);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  async function freeze(conversation: AdminChatConversationDto) {
    const frozen = conversation.state !== "archived";
    setBusyId(conversation.id);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/chat/conversations/${conversation.id}/freeze`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frozen }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setConversations((current) =>
        current.map((row) =>
          row.id === conversation.id
            ? { ...row, state: frozen ? "archived" : "active" }
            : row,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Бесед" value={stats.conversations} />
          <Stat label="Личных" value={stats.directConversations} />
          <Stat label="Групп и каналов" value={stats.groups + stats.channels} />
          <Stat label="Сообщений за неделю" value={stats.messagesLast7Days} />
        </dl>
      )}

      {error && (
        <p className="rounded-xl border border-magenta/30 bg-magenta/10 px-3 py-2 text-sm text-magenta">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-0">Беседы</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию беседы или общины"
          className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3.5 text-[15px] text-text-0 outline-none placeholder:text-text-2"
        />
        {conversations.length === 0 ? (
          <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
            Ничего не нашлось.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-glass-brd bg-glass p-3"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-text-0">
                    {conversation.title}
                    {conversation.state === "archived" && (
                      <span className="ml-2 text-xs text-gold">заморожена</span>
                    )}
                  </span>
                  <span className="text-xs text-text-2">
                    {conversation.kind === "channel"
                      ? "канал"
                      : conversation.kind === "group"
                        ? "группа"
                        : "личный диалог"}
                    {conversation.communityName
                      ? ` · ${conversation.communityName}`
                      : ""}
                    {" · "}
                    <span className="font-mono">{conversation.membersCount}</span>{" "}
                    участников,{" "}
                    <span className="font-mono">
                      {conversation.messagesCount}
                    </span>{" "}
                    сообщений
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void freeze(conversation)}
                  disabled={busyId === conversation.id}
                  className="min-h-11 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
                >
                  {conversation.state === "archived"
                    ? "Разморозить"
                    : "Заморозить"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="text-sm font-semibold text-text-0">Жалобы</h2>
      {reports.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd bg-glass p-8 text-center text-sm text-text-1">
          Открытых жалоб нет.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-text-0">
                  {report.reason}
                </span>
                <span className="text-xs text-text-2">
                  от {report.reporter.name} ·{" "}
                  {new Date(report.createdAt).toLocaleString("ru-RU")}
                </span>
              </div>

              {report.comment && (
                <p className="text-sm text-text-1">{report.comment}</p>
              )}

              {report.messageId && (
                <blockquote className="rounded-xl border border-glass-brd bg-white/5 p-3 text-sm text-text-0">
                  <span className="mb-1 block text-xs text-text-2">
                    {report.messageAuthor?.name ?? "Автор"} ·{" "}
                    {report.conversationKind === "direct"
                      ? "личный диалог"
                      : (report.conversationTitle ?? "беседа")}
                  </span>
                  {report.messageBody || "— сообщение уже удалено —"}
                </blockquote>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void decide(report, "resolve")}
                  disabled={busyId === report.id}
                  className="min-h-11 rounded-xl border border-mint-edge bg-mint px-4 text-sm font-bold text-on-mint disabled:opacity-60"
                >
                  Скрыть сообщение
                </button>
                <button
                  type="button"
                  onClick={() => void decide(report, "reject")}
                  disabled={busyId === report.id}
                  className="min-h-11 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 disabled:opacity-60"
                >
                  Оставить как есть
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-glass-brd bg-glass p-3">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="font-mono text-xl text-text-0">{value}</dd>
    </div>
  );
}
