"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Loader2, MapPin, Monitor } from "lucide-react";
import type { NoticeOccurrenceDto } from "@vedamatch/shared";
import {
  NoticesApiError,
  getNoticeCalendar,
  noticeIcsUrl,
} from "@/lib/notices-api";
import { formatEventTime } from "./notice-labels";

/** Календарь афиши: ближайшие месяцы, сгруппированные по дням. */
export function NoticesCalendarView() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [items, setItems] = useState<NoticeOccurrenceDto[]>([]);
  /**
   * Какой месяц уже загружен. «Загружаем» — производное от него, а не
   * отдельный флаг: иначе пришлось бы звать setState прямо в теле эффекта,
   * а это каскад перерисовок.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const to = new Date(
      now.getFullYear(),
      now.getMonth() + monthOffset + 1,
      0,
      23,
      59,
      59,
    );
    return { from, to };
  }, [monthOffset]);

  const rangeKey = range.from.toISOString();

  useEffect(() => {
    let alive = true;
    // setLoading живёт внутри цепочки, а не в теле эффекта: синхронный
    // setState в эффекте вызывает каскад перерисовок.
    getNoticeCalendar({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    })
      .then((response) => {
        if (alive) setItems(response.items);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof NoticesApiError ? e.message : "Календарь не загрузился",
          );
      })
      .finally(() => {
        if (alive) setLoadedKey(rangeKey);
      });
    return () => {
      alive = false;
    };
  }, [range, rangeKey]);

  const loading = loadedKey !== rangeKey;

  // Группируем по дню в зоне смотрящего: заголовок «6 сентября» должен
  // совпадать с тем, какое сегодня число у него, а не в зоне события.
  const byDay = useMemo(() => {
    const map = new Map<string, NoticeOccurrenceDto[]>();
    for (const item of items) {
      const key = new Date(item.startsAt).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        weekday: "long",
      });
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [items]);

  const monthLabel = range.from.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="glass mb-6 flex items-center justify-between rounded-2xl border border-glass-brd p-4">
        <button
          type="button"
          onClick={() => setMonthOffset((v) => v - 1)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
        >
          ← Раньше
        </button>
        <span className="font-medium text-text-0">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setMonthOffset((v) => v + 1)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
        >
          Позже →
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" /> Загружаем…
        </p>
      ) : byDay.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          В этом месяце событий нет.{" "}
          <Link href="/notices/new" className="text-text-0 underline">
            Позовите на программу
          </Link>
        </div>
      ) : (
        <ul className="space-y-6">
          {byDay.map(([day, events]) => (
            <li key={day}>
              <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
                {day}
              </h2>
              <ul className="space-y-2">
                {events.map((event) => (
                  <li
                    key={`${event.noticeId}-${event.startsAt}`}
                    className="glass rounded-xl border border-glass-brd p-4"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`/notices/${event.noticeId}`}
                        className="font-medium text-text-0 underline"
                      >
                        {event.title}
                      </Link>
                      {event.communityName && (
                        <span className="text-xs text-text-2">
                          {event.communityName}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-1">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-4" />
                        {formatEventTime(event.startsAt, event.timeZone)}
                      </span>
                      {event.isOnline ? (
                        <span className="flex items-center gap-1.5">
                          <Monitor className="size-4" /> Онлайн
                        </span>
                      ) : (
                        (event.venueName ?? event.city) && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-4" />
                            {[event.venueName, event.city]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )
                      )}
                      {/* Обычная ссылка, а не fetch: файл отдаёт API, и
                          браузер сам предложит сохранить его в календарь. */}
                      <a
                        href={noticeIcsUrl(event.noticeId)}
                        className="ml-auto flex items-center gap-1.5 text-text-2 hover:text-text-0"
                      >
                        <Download className="size-4" />В календарь
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
