"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChatCallDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import { isAbort } from "@/lib/is-abort";

/**
 * История звонков.
 *
 * Звонок начинается внутри диалога, и до этого экрана вспомнить, кто звонил
 * вчера, было негде — оставалось листать переписку. Поэтому здесь не только
 * список, но и дорога назад в тот же диалог: перезвонить оттуда.
 */
const STATUS_LABEL: Record<string, string> = {
  ringing: "звонок шёл",
  accepted: "разговор",
  declined: "отклонён",
  missed: "пропущен",
  cancelled: "отменён",
  ended: "завершён",
  failed: "не состоялся",
};

function duration(call: ChatCallDto): string | null {
  if (!call.answeredAt || !call.endedAt) return null;
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(call.endedAt).getTime() -
        new Date(call.answeredAt).getTime()) /
        1000,
    ),
  );
  const minutes = Math.floor(seconds / 60);
  return minutes
    ? `${minutes} мин ${String(seconds % 60).padStart(2, "0")} с`
    : `${seconds} с`;
}

export function CallsHistoryView({ userId }: { userId: string }) {
  const [calls, setCalls] = useState<ChatCallDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/chat/calls/history`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setCalls((await res.json()) as ChatCallDto[]);
      })
      .catch((cause: unknown) => {
        if (isAbort(cause)) return;
        setError("Не удалось загрузить историю звонков");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!calls) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }
  if (!calls.length) {
    return (
      <div className="rounded-2xl border border-glass-brd bg-glass p-4">
        <p className="text-sm text-text-0">Звонков пока не было.</p>
        <p className="mt-1 text-sm text-text-1">
          Звонок начинается из диалога: откройте переписку и нажмите на трубку.
        </p>
        <Link
          href="/chat"
          className="mt-3 inline-block rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0"
        >
          К диалогам
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {calls.map((call) => {
        const outgoing = call.caller.id === userId;
        const other = outgoing ? call.callee : call.caller;
        const missed = call.status === "missed" || call.status === "declined";
        const talk = duration(call);
        return (
          <li
            key={call.id}
            className="flex items-center gap-3 rounded-2xl border border-glass-brd bg-glass px-4 py-3"
          >
            <span
              aria-hidden
              className={`font-mono text-sm ${missed ? "text-magenta" : "text-text-2"}`}
            >
              {outgoing ? "↗" : "↙"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-0">
                {other.name}
              </span>
              <span className="block text-xs text-text-2">
                {outgoing ? "исходящий" : "входящий"}
                {call.kind === "video" ? " · видео" : ""} ·{" "}
                {STATUS_LABEL[call.status] ?? call.status}
                {talk ? ` · ${talk}` : ""} ·{" "}
                {new Date(call.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </span>
            <Link
              href={`/chat/${call.conversationId}`}
              className="shrink-0 text-sm text-cyan underline"
            >
              Открыть
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
