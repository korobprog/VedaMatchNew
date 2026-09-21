"use client";

import { usePathname } from "next/navigation";
import { useGroupCalls } from "./group-call-context";
import { groupCallBannerLabel } from "./group-call-banner-text";

/**
 * Плашка «идёт групповой звонок» — она же «входящий групповой».
 *
 * Группового дозвона с гудками на этом этапе нет намеренно: комната
 * открыта постоянно, входят и выходят по ходу, и звонить всей беседе по
 * каждому входу — это будильник, а не приглашение. Человек видит строку с
 * составом и кнопкой, как в общем голосовом чате Телеграма.
 *
 * Та же плашка возвращает к своей комнате, когда панель свёрнута, — какое
 * из двух состояний показывать и какими словами, решает чистый
 * `group-call-banner-text.ts`.
 */
export function GroupCallBanner() {
  const pathname = usePathname();
  const calls = useGroupCalls();

  if (!calls) return null;
  const own = calls.state.phase === "active" ? calls.state.call : null;
  // Свою комнату видно и так — панель развёрнута.
  if (own && calls.expanded) return null;

  const conversationId = conversationIdFromPath(pathname);
  const inConversation = conversationId
    ? calls.callInConversation(conversationId)
    : null;
  const banner = groupCallBannerLabel(own, inConversation, calls.selfId);
  if (!banner) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-[min(26rem,calc(100%-1.5rem))] items-center gap-3 rounded-2xl border border-glass-brd bg-bg-1 py-2 pl-4 pr-2 shadow-2xl"
      style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full bg-cyan motion-safe:animate-pulse"
      />
      {/* Не `truncate`: на 360px «Групповой звонок · 4 человека» рядом с
          кнопкой не помещается в строку, а обрезанная подпись «4 че…»
          хуже второй строки. */}
      <p className="min-w-0 flex-1 text-sm font-semibold text-text-0">
        {banner.title}
      </p>
      <button
        type="button"
        onClick={() => {
          if (banner.kind === "own") calls.setExpanded(true);
          else void calls.join(banner.callId);
        }}
        // Полная комната не даёт кнопке сработать, но текст отказа
        // остаётся на ней: «войти нельзя» без причины — худший вариант.
        disabled={banner.blocked}
        className="flex h-11 shrink-0 items-center rounded-full bg-magenta px-4 text-sm font-semibold text-white hover:opacity-90 disabled:bg-glass disabled:text-text-1 disabled:opacity-100"
      >
        {banner.action}
      </button>
    </div>
  );
}

/** `/chat/<id>` → `<id>`. Плашку «войти» показываем только в той беседе. */
function conversationIdFromPath(pathname: string | null): string | null {
  const match = /^\/chat\/([^/]+)$/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}
