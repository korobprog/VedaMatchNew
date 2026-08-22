"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChatAttachmentInput,
  ChatConversationSummary,
} from "@vedamatch/shared";
import { sendChatMessage } from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";

/**
 * «Отправить в чат» — общая дверь для остальных сервисов.
 *
 * Мотивация, Объявления и Рынок приводят сюда обычной ссылкой с описанием
 * карточки в адресе и ничего не знают про устройство чата. Сама карточка
 * сохраняется снимком: заголовок, текст и картинка копируются в сообщение,
 * поэтому изменённый или удалённый оригинал не оставляет дыру в переписке.
 */
export function ChatShareView({
  conversations,
  attachment,
  sourceLabel,
}: {
  conversations: ChatConversationSummary[];
  attachment: ChatAttachmentInput;
  sourceLabel: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function share(conversation: ChatConversationSummary) {
    setBusyId(conversation.id);
    setError(null);
    try {
      await sendChatMessage(conversation.id, {
        body: comment.trim(),
        attachments: [attachment],
      });
      router.push(`/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не отправилось");
      setBusyId(null);
    }
  }

  const writable = conversations.filter((conversation) => conversation.canWrite);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
          {error}
        </p>
      )}

      <article className="flex flex-col gap-2 rounded-2xl border border-gold/26 bg-gold/8 p-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-gold">
          {sourceLabel}
        </span>
        {attachment.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.previewUrl}
            alt=""
            className="max-h-52 w-full rounded-xl object-cover"
          />
        )}
        <span className="font-display text-sm font-semibold leading-5 text-text-0">
          {attachment.title}
        </span>
        {attachment.body && (
          <span className="text-xs leading-4 text-text-1">
            {attachment.body}
          </span>
        )}
      </article>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-1">
          Добавить к отправке
        </span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          placeholder="Пара слов — необязательно"
          className="min-h-11 resize-none rounded-2xl border border-glass-brd bg-glass px-3.5 py-3 text-[15px] text-text-0 outline-none placeholder:text-text-2"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-1">Кому отправить</span>
        {writable.length === 0 ? (
          <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
            Пока некуда отправлять: заведите переписку, и карточку будет куда
            переслать.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {writable.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => void share(conversation)}
                  disabled={busyId !== null}
                  className="flex w-full items-center gap-3 rounded-2xl border border-transparent p-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
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
                    {busyId === conversation.id ? "Отправляю…" : "Отправить"}
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
