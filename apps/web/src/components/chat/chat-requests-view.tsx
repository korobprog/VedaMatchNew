"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatRequestsState, ChatRequestSummary } from "@vedamatch/shared";
import {
  acceptChatRequest,
  declineChatRequest,
  reportChat,
} from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";
import { formatChatStamp } from "./chat-time";

/**
 * Запросы на переписку. Профиль без фото и без общин показывается свёрнутым:
 * столько же усилий на создание, сколько у спамера, и столько же доверия.
 */
export function ChatRequestsView({ initial }: { initial: ChatRequestsState }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initial.requests);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function accept(request: ChatRequestSummary) {
    setBusyId(request.conversation.id);
    try {
      await acceptChatRequest(request.conversation.id);
      router.push(`/chat/${request.conversation.id}`);
    } finally {
      setBusyId(null);
    }
  }

  async function decline(request: ChatRequestSummary) {
    setBusyId(request.conversation.id);
    try {
      await declineChatRequest(request.conversation.id);
      setRequests((current) =>
        current.filter((r) => r.conversation.id !== request.conversation.id),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0)
    return (
      <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
        Запросов нет. Здесь появляется первое сообщение от незнакомых людей.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2.5 rounded-2xl border border-glass-brd bg-white/4 px-3.5 py-3 text-xs leading-[17px] text-text-1">
        <ShieldIcon />
        Пока вы не ответили, человек может отправить только одно сообщение и не
        видит, прочитано ли оно.
      </p>

      {requests.map((request) => (
        <RequestCard
          key={request.conversation.id}
          request={request}
          busy={busyId === request.conversation.id}
          onAccept={() => void accept(request)}
          onDecline={() => void decline(request)}
          onReport={() =>
            void reportChat({
              reason: "Жалоба на запрос",
              conversationId: request.conversation.id,
            })
          }
        />
      ))}
    </div>
  );
}

function RequestCard({
  request,
  busy,
  onAccept,
  onDecline,
  onReport,
}: {
  request: ChatRequestSummary;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onReport: () => void;
}) {
  const [revealed, setRevealed] = useState(!request.lowTrust);

  if (!revealed)
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-dashed border-glass-brd bg-white/3 p-3.5">
        <span className="flex size-11 items-center justify-center rounded-full border border-glass-brd bg-white/5 text-text-2">
          <PersonIcon />
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-1">
            Скрытый запрос
          </span>
          <span className="text-xs text-text-2">
            Профиль без фото и без общин
          </span>
        </span>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="min-h-11 rounded-xl border border-glass-brd px-3.5 text-[13px] font-semibold text-text-1 hover:text-text-0"
        >
          Показать
        </button>
      </div>
    );

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-glass-brd bg-glass p-3.5">
      <header className="flex items-center gap-3">
        <ChatAvatar kind="direct" user={request.from} title={request.from.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-bold text-text-0">
            {request.from.name}
          </span>
          <span className="text-xs text-text-1">Хочет написать вам</span>
        </div>
        <span className="font-mono text-[11px] text-text-2">
          {formatChatStamp(request.createdAt)}
        </span>
      </header>

      {request.message && (
        <p className="rounded-2xl rounded-bl-md border border-glass-brd bg-white/5 px-3.5 py-2.5 text-sm leading-5 text-text-0">
          {request.message.body || "Вложение"}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-mint-edge bg-mint text-sm font-bold text-on-mint disabled:opacity-60"
        >
          Принять
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-glass-brd bg-white/5 text-sm font-semibold text-text-1 disabled:opacity-60"
        >
          Отклонить
        </button>
        <button
          type="button"
          onClick={onReport}
          aria-label="Пожаловаться"
          className="flex size-11 items-center justify-center rounded-2xl border border-magenta/26 bg-magenta/5 text-magenta"
        >
          <FlagIcon />
        </button>
      </div>
    </article>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-cyan"
      aria-hidden
    >
      <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 21V4.5" />
      <path d="M5 5.5h11l-1.6 3.6L16 12.7H5z" />
    </svg>
  );
}
