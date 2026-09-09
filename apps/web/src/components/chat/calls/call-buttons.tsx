"use client";

import { useChatCalls } from "./call-provider";

/**
 * Кнопки «позвонить» в шапке личного диалога. Показываются только там,
 * где писать разрешено: правила у звонка те же, что у сообщения.
 */
export function CallButtons({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled: boolean;
}) {
  const calls = useChatCalls();
  if (!calls) return null;
  const busy = calls.state.phase !== "idle";

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Аудиозвонок"
        title="Аудиозвонок"
        disabled={disabled || busy}
        onClick={() => void calls.start(conversationId, "audio")}
        className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0 disabled:opacity-40"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Видеозвонок"
        title="Видеозвонок"
        disabled={disabled || busy}
        onClick={() => void calls.start(conversationId, "video")}
        className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0 disabled:opacity-40"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="7" width="13" height="10" rx="2" />
          <path d="M16 11l5-3v8l-5-3" />
        </svg>
      </button>
    </div>
  );
}
