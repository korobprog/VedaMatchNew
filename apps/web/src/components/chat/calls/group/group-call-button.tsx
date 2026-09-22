"use client";

import { useEffect } from "react";
import type { ChatConversationKind } from "@vedamatch/shared";
import { useGroupCalls } from "./group-call-context";
import { canStartGroupCall, groupCallButtonLabel } from "./group-call-entry";

/**
 * Кнопка группового звонка в шапке беседы. Есть только в группах, где
 * человеку разрешено писать: в канале комната на четверых смысла не имеет,
 * а в личном диалоге для этого есть звонок один на один.
 *
 * Подпись меняется по обстановке — «Групповой звонок», «Присоединиться к
 * звонку, 2 в комнате», «В звонке уже 4 человека» — и решает это чистый
 * `group-call-entry.ts`, а не разметка.
 */
export function GroupCallButton({
  conversationId,
  kind,
  canWrite,
}: {
  conversationId: string;
  kind: ChatConversationKind;
  canWrite: boolean;
}) {
  const calls = useGroupCalls();
  const watch = calls?.watchConversation;

  // Звонок мог начаться, пока вкладка была закрыта: событий потока об этом
  // не будет, спрашиваем сервер при открытии беседы.
  useEffect(() => {
    if (!watch) return;
    watch(conversationId);
  }, [conversationId, watch]);

  if (!calls || !canStartGroupCall({ kind, canWrite })) return null;

  const ongoing = calls.callInConversation(conversationId);
  const label = groupCallButtonLabel(ongoing, calls.state.phase);

  return (
    <button
      type="button"
      aria-label={label.text}
      title={label.text}
      disabled={label.disabled}
      onClick={() => void calls.startOrJoin(conversationId)}
      className={`flex size-11 items-center justify-center rounded-2xl hover:text-text-0 disabled:opacity-40 ${
        ongoing ? "text-cyan" : "text-text-1"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M2 20a7 7 0 0 1 14 0" />
        <path d="M16 6.5a3 3 0 0 1 0 5" />
        <path d="M18.5 4a6 6 0 0 1 0 10" />
      </svg>
    </button>
  );
}
