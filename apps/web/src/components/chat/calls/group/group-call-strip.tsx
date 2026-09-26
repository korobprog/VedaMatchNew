"use client";

import { conversationCallStrip } from "./group-call-banner-text";
import { useGroupCalls } from "./group-call-context";

/**
 * Плашка над перепиской: «Идёт звонок · 2 из 4 · [Войти]», а если мы уже
 * внутри — «Вы в звонке · 2 из 4 · [Вернуться в звонок]».
 *
 * Стоит в потоке страницы под шапкой беседы, а не плавает поверх: в
 * конференции это главное действие, и оно не должно закрывать ни шапку, ни
 * первые сообщения. Плавающая `GroupCallBanner` на этом экране поэтому
 * молчит о своём звонке — две одинаковые строки на одном экране путают.
 *
 * Кнопка ведёт в тот же `join` провайдера, что и кнопка в шапке, — второго
 * пути подключения нет. Что написать и можно ли нажать, решает чистый
 * `group-call-banner-text.ts`.
 */
export function GroupCallStrip({ conversationId }: { conversationId: string }) {
  const calls = useGroupCalls();
  if (!calls) return null;

  const own = calls.state.phase === "active" ? calls.state.call : null;
  const strip = conversationCallStrip(
    conversationId,
    own,
    calls.callInConversation(conversationId),
    calls.selfId,
    calls.state.phase,
  );
  if (!strip) return null;

  return (
    <div className="flex items-center gap-3 border-b border-glass-brd bg-cyan/6 py-2 pl-2 pr-1">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse"
      />
      {/* role="status": о начавшемся звонке скринридер скажет сам, без
          поиска по странице. Не `truncate` — «Идёт звонок · 2 из 4» рядом с
          кнопкой на 360px лучше перенести, чем обрезать. */}
      <p
        role="status"
        className="min-w-0 flex-1 text-sm font-semibold text-text-0"
      >
        {strip.title}
      </p>
      <button
        type="button"
        onClick={() => {
          if (strip.kind === "own") calls.setExpanded(true);
          else void calls.join(strip.callId);
        }}
        // Погасшая кнопка оставляет причину на себе: «войти нельзя» без
        // объяснения — худший вариант.
        disabled={strip.blocked}
        className="flex h-11 shrink-0 items-center rounded-full bg-magenta px-4 text-sm font-semibold text-bg-0 hover:opacity-90 disabled:bg-glass disabled:text-text-1 disabled:opacity-100"
      >
        {strip.action}
      </button>
    </div>
  );
}
