"use client";

import { useState } from "react";
import type { UnionAdminChatResponse } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Переписка пары по жалобе. Не загружается вместе со страницей: чужой чат
 * открывают осознанно, и каждый такой просмотр попадает в журнал действий —
 * поэтому здесь и кнопка, и предупреждение о ней.
 */
export function UnionReportChat({ reportId }: { reportId: string }) {
  const [chat, setChat] = useState<UnionAdminChatResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/union/admin/reports/${encodeURIComponent(reportId)}/chat`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      setChat((await response.json()) as UnionAdminChatResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setPending(false);
    }
  }

  if (!chat) {
    return (
      <div className="mt-3 border-t border-glass-brd pt-3">
        {error && <Alert tone="error">{error}</Alert>}
        <button
          type="button"
          disabled={pending}
          onClick={() => void load()}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          {pending ? "Загружаем…" : "Показать переписку"}
        </button>
        <p className="mt-1.5 text-xs text-text-2">
          Открытие чужой переписки записывается в журнал действий.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-glass-brd pt-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-text-2">
        Переписка · {chat.reporter.name} и {chat.target.name}
      </p>
      {chat.messages.length === 0 ? (
        <p className="text-sm text-text-1">
          Переписки между ними нет: заявка на знакомство не создавалась.
        </p>
      ) : (
        <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {chat.messages.map((message) => (
            <li
              key={message.id}
              className="rounded-xl border border-glass-brd bg-bg-1 p-2.5"
            >
              <p className="text-xs text-text-2">
                {message.fromName} ·{" "}
                {new Date(message.createdAt).toLocaleString("ru-RU")}
                {message.editedAt && " · изменено"}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-text-0">
                {message.body}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
