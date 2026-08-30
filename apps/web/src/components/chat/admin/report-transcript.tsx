"use client";

import { useState } from "react";
import type { AdminChatDirectTranscript } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Переписка пары по жалобе. Не загружается вместе со страницей: чужой чат
 * открывают осознанно, и каждый такой просмотр попадает в журнал действий —
 * поэтому здесь и кнопка, и предупреждение о ней.
 *
 * Живёт в «Общении», потому что переписка теперь его: Знакомствам читать её
 * из чужого модуля нельзя. Ищется она по паре людей, а не по id беседы —
 * личный диалог у пары ровно один.
 */
export function ChatReportTranscript({
  reporterId,
  targetId,
  reporterName,
  targetName,
}: {
  reporterId: string;
  targetId: string;
  reporterName: string;
  targetName: string;
}) {
  const [chat, setChat] = useState<AdminChatDirectTranscript | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/admin/chat/direct-transcript?a=${encodeURIComponent(reporterId)}&b=${encodeURIComponent(targetId)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      setChat((await response.json()) as AdminChatDirectTranscript);
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
          Открытие чужой переписки записывается в журнал действий. Видны и
          удалённые сообщения — пока не истёк срок их хранения.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-glass-brd pt-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-text-2">
        Переписка · {reporterName} и {targetName}
      </p>
      {chat.truncated && (
        <p className="mb-2 text-xs text-gold">
          Показаны последние {chat.messages.length} сообщений — в переписке их
          больше.
        </p>
      )}
      {chat.messages.length === 0 ? (
        <p className="text-sm text-text-1">
          Личной переписки между ними нет.
        </p>
      ) : (
        <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {chat.messages.map((message) => (
            <li
              key={message.id}
              className="rounded-xl border border-glass-brd bg-bg-1 p-2.5"
            >
              <p className="text-xs text-text-2">
                {message.authorName} ·{" "}
                {new Date(message.createdAt).toLocaleString("ru-RU")}
                {message.editedAt && " · изменено"}
                {message.attachments > 0 &&
                  ` · вложений: ${message.attachments}`}
              </p>
              {/* Удалённое показываем с текстом и пометкой. Прятать его здесь
                  было нечестно вдвойне: типовая травля — написать и стереть,
                  а сам текст всё равно приходил в ответе и был виден в
                  средствах разработчика. Границы этому доступу ставит сервер —
                  живая жалоба, журнал и срок хранения. */}
              {message.deletedAt && (
                <p className="mt-1 text-xs font-semibold text-gold">
                  Удалено автором{" "}
                  {new Date(message.deletedAt).toLocaleString("ru-RU")}
                </p>
              )}
              <p
                className={`mt-1 whitespace-pre-line text-sm ${
                  message.deletedAt ? "text-text-1 italic" : "text-text-0"
                }`}
              >
                {message.body || "— без текста —"}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
