"use client";

import Link from "next/link";
import {
  BellOff,
  ClipboardList,
  MessageCircle,
  Heart,
  LifeBuoy,
  Film,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  NotificationCategory,
  NotificationItemDto,
} from "@vedamatch/shared";
import { fetchInbox, markInboxRead } from "@/lib/notifications-api";
import { setUnreadCount } from "@/lib/notifications-unread";

const categoryIcons: Record<NotificationCategory, React.ReactNode> = {
  chat: <MessageCircle size={18} aria-hidden="true" />,
  connections: <Heart size={18} aria-hidden="true" />,
  support: <LifeBuoy size={18} aria-hidden="true" />,
  transits: <Sparkles size={18} aria-hidden="true" />,
  market: <ShoppingBasket size={18} aria-hidden="true" />,
  notices: <ClipboardList size={18} aria-hidden="true" />,
  motivation: <Film size={18} aria-hidden="true" />,
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function NotificationList() {
  const [items, setItems] = useState<NotificationItemDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchInbox()
      .then(async ({ items: loaded }) => {
        if (cancelled) return;
        setItems(loaded);
        // Открыли список — значит прочитали. Значок гасим сразу, не дожидаясь
        // ответа сервера: список уже на экране.
        setUnreadCount(0);
        if (loaded.length > 0) await markInboxRead();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed)
    return (
      <p className="text-sm text-magenta">
        Не удалось загрузить уведомления. Попробуйте обновить страницу.
      </p>
    );

  if (items === null)
    return <p className="text-sm text-text-2">Загружаем…</p>;

  if (items.length === 0)
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl border border-glass-brd px-6 py-12 text-center">
        <BellOff className="h-8 w-8 text-text-2" aria-hidden="true" />
        <p className="font-medium text-text-0">Непрочитанного нет</p>
        <p className="max-w-sm text-sm text-text-1">
          Здесь появляются новые сообщения, заявки и ответы поддержки.
          Прочитанные уведомления удаляются сами — архив не копится.
        </p>
      </div>
    );

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.url}
            className="glass flex gap-3 rounded-2xl border border-glass-brd p-4 transition-colors hover:border-magenta/30"
          >
            <span className="mt-0.5 shrink-0 text-magenta">
              {categoryIcons[item.category]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium text-text-0">
                  {item.title}
                </span>
                <span className="shrink-0 text-xs text-text-2">
                  {formatWhen(item.createdAt)}
                </span>
              </span>
              <span className="mt-1 block text-sm text-text-1">{item.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
