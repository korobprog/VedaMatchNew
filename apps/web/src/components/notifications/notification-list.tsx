"use client";

/**
 * Список уведомлений.
 *
 * Прочитанным помечается только то, что человек открыл. Раньше страница гасила
 * весь список одним запросом при загрузке: открыл одно уведомление, вернулся —
 * а остальных нет, хотя до них ещё не дошли руки. Прочитанное не исчезает
 * сразу, а лежит ниже, приглушённое, неделю; погасить всё разом можно кнопкой.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff } from "lucide-react";
import type {
  NotificationItemDto,
  NotificationCategory,
} from "@vedamatch/shared";
import { fetchInbox, markInboxRead } from "@/lib/notifications-api";
import { setUnreadCount } from "@/lib/notifications-unread";
import { NotificationIcon } from "@/components/icons/notification-icons";

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
      .then(({ items: loaded, unreadCount }) => {
        if (cancelled) return;
        setItems(loaded);
        setUnreadCount(unreadCount);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = items?.filter((item) => item.readAt === null) ?? [];
  const read = items?.filter((item) => item.readAt !== null) ?? [];

  /**
   * Помечаем прочитанным сразу в состоянии и не ждём сервер: переход по ссылке
   * уводит со страницы, и ответ пришёл бы уже некуда.
   */
  function markOne(id: string) {
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ) ?? null,
    );
    setUnreadCount(Math.max(0, unread.length - 1));
    void markInboxRead([id]).catch(() => undefined);
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems(
      (current) =>
        current?.map((item) =>
          item.readAt === null ? { ...item, readAt: now } : item,
        ) ?? null,
    );
    setUnreadCount(0);
    void markInboxRead().catch(() => undefined);
  }

  if (failed)
    return (
      <p className="text-sm text-magenta">
        Не удалось загрузить уведомления. Попробуйте обновить страницу.
      </p>
    );

  if (items === null) return <p className="text-sm text-text-2">Загружаем…</p>;

  if (items.length === 0)
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl border border-glass-brd px-6 py-12 text-center">
        <BellOff className="h-8 w-8 text-text-2" aria-hidden="true" />
        <p className="font-medium text-text-0">Уведомлений нет</p>
        <p className="max-w-sm text-sm text-text-1">
          Здесь появляются новые сообщения, заявки и ответы поддержки.
          Прочитанные остаются на неделю — успеете вернуться.
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      {unread.length > 0 && (
        <section aria-label="Непрочитанные">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-0">
              Новое · {unread.length}
            </h2>
            <button
              type="button"
              onClick={markAll}
              className="rounded-full border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 hover:text-text-0"
            >
              Отметить все прочитанными
            </button>
          </div>
          <ul className="space-y-3">
            {unread.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} onOpen={() => markOne(item.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {read.length > 0 && (
        <section aria-label="Прочитанные">
          <h2 className="mb-3 text-sm font-semibold text-text-2">Прочитанное</h2>
          <ul className="space-y-3">
            {read.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} muted />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NotificationCard({
  item,
  muted = false,
  onOpen,
}: {
  item: NotificationItemDto;
  /** Прочитанное: остаётся читаемым, но не спорит за внимание с новым. */
  muted?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Link
      href={item.url}
      onClick={onOpen}
      className={`glass flex gap-3 rounded-2xl border p-4 transition-colors hover:border-magenta/30 ${
        muted ? "border-glass-brd/60 opacity-70" : "border-glass-brd"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        <NotificationIcon category={item.category as NotificationCategory} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium text-text-0">{item.title}</span>
          <span className="shrink-0 text-xs text-text-2">
            {formatWhen(item.createdAt)}
          </span>
        </span>
        <span className="mt-1 block text-sm text-text-1">{item.body}</span>
      </span>
    </Link>
  );
}
