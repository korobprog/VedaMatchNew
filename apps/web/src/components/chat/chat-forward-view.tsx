"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChatConversationSummary,
  ChatMessageDto,
} from "@vedamatch/shared";
import { forwardChatMessage } from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";

/**
 * Пересылка сообщения. Копией, а не ссылкой: получатель может не состоять
 * в исходной беседе, и «открыть оригинал» ему было бы некуда. Имя автора
 * уезжает подписью-снимком.
 */
export function ChatForwardView({
  message,
  conversations,
  fromConversationId,
}: {
  message: ChatMessageDto;
  conversations: ChatConversationSummary[];
  fromConversationId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targets = conversations.filter(
    (conversation) =>
      conversation.canWrite && conversation.id !== fromConversationId,
  );

  async function forward(conversation: ChatConversationSummary) {
    setBusyId(conversation.id);
    setError(null);
    try {
      await forwardChatMessage(message.id, conversation.id);
      router.push(`/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не переслалось");
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
          {error}
        </p>
      )}

      <article className="flex flex-col gap-2 rounded-2xl border border-glass-brd bg-glass p-3.5">
        <span className="text-xs text-text-2">
          Сообщение от {message.author.name}
        </span>
        <p className="whitespace-pre-wrap text-[15px] leading-[21px] text-text-0">
          {message.body || "Вложение"}
        </p>
        {message.attachments.length > 0 && (
          <span className="text-xs text-text-1">
            Вложений: {message.attachments.length}
          </span>
        )}
      </article>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-1">Куда переслать</span>
        {targets.length === 0 ? (
          <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
            Некуда пересылать: других бесед, куда можно писать, пока нет.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {targets.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => void forward(conversation)}
                  disabled={busyId !== null}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                >
                  <ChatAvatar
                    kind={conversation.kind}
                    user={conversation.companion}
                    title={conversation.title}
                    size={44}
                  />
                  <span className="flex-1 text-[15px] font-semibold text-text-0">
                    {conversation.title}
                  </span>
                  <span className="text-[13px] font-semibold text-cyan">
                    {busyId === conversation.id ? "Пересылаю…" : "Переслать"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
