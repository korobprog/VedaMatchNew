"use client";

/**
 * История уведомлений (VED-404).
 *
 * Заказчик: «В истории должны храниться прочитанные уведомления согласно
 * хронологии контакта с ними. Контакт означает открывать и всё остальное».
 * Лента упорядочена по дате прихода, и уведомление недельной давности,
 * открытое минуту назад, лежит в ней в самом низу. Здесь то же прочитанное,
 * но сверху — то, с чем человек имел дело последним: открыл, отметил, закрыл
 * задачу, о которой оно. Порядок считает сервер (`contactAt`), страница его
 * только делит по дням — как история переходов по порталу (VED-392).
 *
 * Карточка та же, что в ленте, и ведёт себя так же: ссылка открывает
 * уведомление (и поднимает его в истории — это новый контакт), кнопка справа
 * возвращает в непрочитанные и обратно. Время на карточке — время контакта:
 * день уже назван заголовком группы.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { NotificationItemDto } from "@vedamatch/shared";
import {
  fetchInboxHistory,
  markInboxRead,
  setInboxItemRead,
} from "@/lib/notifications-api";
import {
  groupHistoryByDay,
  HISTORY_PAGE_SIZE,
  historyTimeLabel,
  mergeHistoryPages,
  setHistoryItemRead,
} from "@/lib/notifications-history";
import { setUnreadCount } from "@/lib/notifications-unread";
import {
  SCROLL_NAV_GUTTER,
  ScrollNavButtons,
} from "@/components/ui/scroll-nav-buttons";
import { NotificationCard } from "./notification-list";

export function NotificationHistory() {
  /** `null` — историю ещё не прочитали ни разу. */
  const [items, setItems] = useState<NotificationItemDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  /** Итог нажатия кнопки на карточке — вслух, как в ленте (VED-143). */
  const [announce, setAnnounce] = useState("");
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    void fetchInboxHistory({ limit: HISTORY_PAGE_SIZE })
      .then((page) => {
        if (id !== requestId.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setFailed(false);
      })
      .catch(() => {
        if (id === requestId.current) setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreFailed(false);
    void fetchInboxHistory({ cursor: nextCursor, limit: HISTORY_PAGE_SIZE })
      .then((page) => {
        if (id !== requestId.current) return;
        setItems((current) =>
          mergeHistoryPages(current ?? [], page.items),
        );
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (id === requestId.current) setMoreFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }

  /** Открыли — это контакт: сервер поднимет уведомление в истории. Ответа не
   *  ждём, переход по ссылке уводит со страницы. */
  function touch(id: string) {
    void markInboxRead([id]).catch(() => undefined);
  }

  /** Кнопка на карточке: сразу в состоянии, неудача откатывает. */
  function toggleRead(id: string, read: boolean) {
    setItems((current) =>
      current ? setHistoryItemRead(current, id, read) : current,
    );
    setAnnounce(
      read
        ? "Уведомление отмечено прочитанным"
        : "Уведомление возвращено в непрочитанные",
    );
    void setInboxItemRead(id, read)
      .then((state) => setUnreadCount(state.unreadCount))
      .catch(() => {
        setItems((current) =>
          current ? setHistoryItemRead(current, id, !read) : current,
        );
        setAnnounce("Не удалось изменить отметку. Попробуйте ещё раз.");
      });
  }

  const groups = useMemo(() => groupHistoryByDay(items ?? []), [items]);

  if (failed)
    return (
      <p className="text-sm text-magenta">
        Не удалось загрузить историю. Попробуйте обновить страницу.
      </p>
    );

  if (items === null) return <p className="text-sm text-text-2">Загружаем…</p>;

  if (items.length === 0)
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl border border-glass-brd px-6 py-12 text-center">
        <History className="h-8 w-8 text-text-2" aria-hidden="true" />
        <p className="font-medium text-text-0">История пока пуста</p>
        <p className="max-w-sm text-sm text-text-1">
          Здесь появляются уведомления, которые вы открыли или отметили
          прочитанными, — последнее сверху.
        </p>
        <Link
          href="/notifications"
          className="inline-flex min-h-11 items-center rounded-full border border-glass-brd px-4 text-sm font-medium text-text-1 hover:text-text-0"
        >
          К новым уведомлениям
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {groups.map((group) => (
        // Поле справа — под кнопки прокрутки на телефоне, как в ленте.
        <section
          key={group.key}
          aria-label={group.label}
          className={SCROLL_NAV_GUTTER}
        >
          <h2 className="mb-3 text-sm font-semibold text-text-1">
            {group.label}
          </h2>
          <ul className="space-y-3">
            {group.items.map((item) => (
              <li key={item.id}>
                <NotificationCard
                  item={item}
                  when={historyTimeLabel(item)}
                  onOpen={() => touch(item.id)}
                  onToggleRead={(read) => toggleRead(item.id, read)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {nextCursor && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="glass min-h-11 rounded-full border border-glass-brd px-5 py-2 text-sm font-medium text-text-0 transition-colors hover:border-magenta/40 disabled:text-text-1"
          >
            {loadingMore ? "Загружаем…" : "Показать ещё"}
          </button>
          {moreFailed && (
            <p className="text-xs text-magenta">
              Не удалось загрузить продолжение. Попробуйте ещё раз.
            </p>
          )}
        </div>
      )}

      {/* Полоса прокрутки — та же, что в ленте уведомлений (VED-251). */}
      <ScrollNavButtons />
    </div>
  );
}
