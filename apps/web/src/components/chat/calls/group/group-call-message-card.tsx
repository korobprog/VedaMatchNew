"use client";

import type { ChatAttachmentDto } from "@vedamatch/shared";
import { useGroupCalls } from "./group-call-context";
import { groupCallCardView } from "./group-call-card";

/**
 * Карточка группового звонка в ленте: «Звонок начался · 2 из 4 · [Войти в
 * звонок]», после конца — «Звонок завершён · 12:05».
 *
 * Карточку пишет сервер, когда комната открывается, и правит, когда
 * закрывается. Живое (места, «Мест нет», «Вернуться») берётся у провайдера
 * по `conversationId` сообщения — тот же источник, что у плашки над
 * перепиской, поэтому они не расходятся. Кнопка — тот же `join`.
 */
export function GroupCallCard({
  attachment,
  conversationId,
}: {
  attachment: ChatAttachmentDto;
  conversationId: string;
}) {
  const calls = useGroupCalls();
  const view = groupCallCardView(attachment, {
    live: calls?.callInConversation(conversationId) ?? null,
    own: calls?.state.phase === "active" ? calls.state.call : null,
    selfId: calls?.selfId ?? "",
    phase: calls?.state.phase ?? "idle",
  });
  // Без провайдера (страница без звонков) кнопке некуда вести.
  const action = calls ? view.action : null;

  return (
    <span className="flex flex-col gap-2.5 rounded-xl border border-glass-brd bg-white/5 p-2.5">
      <span className="flex items-center gap-3">
        <span
          className={`relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/6 ${
            view.live ? "text-cyan" : "text-text-1"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="9" cy="8" r="3" />
            <path d="M3 19a6 6 0 0 1 12 0" />
            <path d="M16 6a3 3 0 0 1 0 6" />
            <path d="M18.5 19a5.5 5.5 0 0 0-2.2-4.4" />
          </svg>
          {view.live && (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-2 rounded-full bg-cyan motion-safe:animate-pulse"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-text-0">
            {view.title}
          </span>
          {/* text-1, а не text-2, как у записи звонка один на один: 11px
              на стекле чужого пузыря в тёмной теме text-2 не дотягивает до
              4.5:1, а тут ещё и места «4 из 4», которые надо прочесть. */}
          <span className="font-mono text-[11px] text-text-1">
            {view.detail
              ? `Групповой звонок · ${view.detail}`
              : "Групповой звонок"}
          </span>
        </span>
      </span>
      {action && (
        <button
          type="button"
          onClick={() => {
            if (action.kind === "return") calls?.setExpanded(true);
            else if (attachment.sourceId) void calls?.join(attachment.sourceId);
          }}
          disabled={action.blocked}
          className="flex h-11 items-center justify-center rounded-full bg-magenta px-4 text-sm font-semibold text-bg-0 hover:opacity-90 disabled:bg-glass disabled:text-text-1 disabled:opacity-100"
        >
          {action.label}
        </button>
      )}
    </span>
  );
}
