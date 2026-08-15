"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { fetchUnreadCount } from "@/lib/notifications-api";
import {
  getUnreadCount,
  getUnreadCountServerSnapshot,
  setUnreadCount,
  subscribeUnreadCount,
} from "@/lib/notifications-unread";

/** Опрос вместо сокета: одно число раз в минуту дешевле постоянного соединения. */
const pollIntervalMs = 60_000;

export function NotificationBell({ className = "" }: { className?: string }) {
  const count = useSyncExternalStore(
    subscribeUnreadCount,
    getUnreadCount,
    getUnreadCountServerSnapshot,
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      // Вкладка в фоне — запрос всё равно отложится браузером, не тратим его.
      if (document.visibilityState === "hidden") return;
      void fetchUnreadCount()
        .then(({ unreadCount }) => {
          if (!cancelled) setUnreadCount(unreadCount);
        })
        .catch(() => {
          // Молча: сломанный значок не повод показывать ошибку в шапке.
        });
    };

    refresh();
    const timer = window.setInterval(refresh, pollIntervalMs);
    // Возврат на вкладку — самый вероятный момент, когда счётчик устарел.
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const label =
    count > 0 ? `Уведомления, непрочитанных: ${count}` : "Уведомления";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0 ${className}`}
    >
      <Bell size={20} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-magenta px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_10px_rgba(255,62,158,0.6)]"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
