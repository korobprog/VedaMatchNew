"use client";

import { usePathname } from "next/navigation";
import { useGroupCalls } from "./group-call-context";
import { ownCallBanner } from "./group-call-banner-text";

/**
 * Плавающая плашка «Вы в звонке · 2 из 4 · [Вернуться в звонок]» — путь
 * назад к своей комнате, когда панель свёрнута, с любой страницы сайта.
 *
 * Приглашение «идёт звонок, войти» здесь больше не живёт: оно стоит в
 * потоке беседы над перепиской (`GroupCallStrip`) и карточкой в ленте
 * (`GroupCallCard`), где не закрывает шапку и первые сообщения. По той же
 * причине в беседе самого звонка эта плашка молчит — там её заменяет
 * строка над перепиской с тем же текстом.
 */
export function GroupCallBanner() {
  const pathname = usePathname();
  const calls = useGroupCalls();

  if (!calls) return null;
  const own = calls.state.phase === "active" ? calls.state.call : null;
  // Свою комнату видно и так — панель развёрнута.
  if (!own || calls.expanded) return null;
  if (conversationIdFromPath(pathname) === own.conversationId) return null;

  const banner = ownCallBanner(own);

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
      {/* Не `truncate`: на 360px «Вы в звонке · 4 из 4» рядом с кнопкой
          не помещается в строку, а обрезанная подпись хуже второй строки. */}
      <p className="min-w-0 flex-1 text-sm font-semibold text-text-0">
        {banner.title}
      </p>
      <button
        type="button"
        onClick={() => calls.setExpanded(true)}
        className="flex h-11 shrink-0 items-center rounded-full bg-magenta px-4 text-sm font-semibold text-bg-0 hover:opacity-90 disabled:bg-glass disabled:text-text-1 disabled:opacity-100"
      >
        {banner.action}
      </button>
    </div>
  );
}

/** `/chat/<id>` → `<id>`: в беседе своего звонка плашку заменяет строка над перепиской. */
function conversationIdFromPath(pathname: string | null): string | null {
  const match = /^\/chat\/([^/]+)$/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}
