"use client";

import { ChatAvatar } from "../chat-avatar";
import { companionOf } from "./call-machine";
import { useChatCalls } from "./call-provider";

/**
 * Входящий звонок поверх любого раздела портала. Баннер, а не полный
 * экран: человек может быть посреди дела, и «ответить / отклонить» —
 * это два жеста, которым не нужен весь экран.
 */
export function IncomingCallBanner() {
  const calls = useChatCalls();
  if (!calls || calls.state.phase !== "incoming" || !calls.state.call) return null;
  const { call } = calls.state;
  const from = companionOf(call, calls.selfId);

  return (
    <div
      role="alertdialog"
      aria-labelledby="incoming-call-title"
      aria-describedby="incoming-call-kind"
      className="fixed inset-x-0 top-3 z-[60] mx-auto w-[min(26rem,calc(100%-1.5rem))] rounded-3xl border border-glass-brd bg-bg-1 p-4 shadow-2xl"
      style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-3">
        <ChatAvatar kind="direct" user={from} title={from.name} size={48} />
        <div className="min-w-0 flex-1">
          <p
            id="incoming-call-title"
            className="truncate font-display text-base font-semibold text-text-0"
          >
            {from.name}
          </p>
          <p id="incoming-call-kind" className="text-sm text-text-1">
            {call.kind === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок"}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void calls.decline()}
          className="rounded-full border border-glass-brd bg-glass px-4 py-2.5 text-sm font-semibold text-text-0 hover:bg-white/10"
        >
          Отклонить
        </button>
        <button
          type="button"
          onClick={() => void calls.accept()}
          className="rounded-full bg-magenta px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Ответить
        </button>
      </div>
    </div>
  );
}
