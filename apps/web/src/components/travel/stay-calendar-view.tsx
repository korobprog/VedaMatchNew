"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  TRAVEL_BOOKING_STATUS_LABELS,
  type TravelBookingStatus,
  type TravelManagedOccupancyBooking,
  type TravelManagedOccupancyResponse,
} from "@vedamatch/shared";
import { getManagedStayOccupancy, getTravelStay } from "@/lib/travel-api";
import {
  dayTitle,
  monthDays,
  monthStart,
  monthTitle,
  mondayOffset,
  nightsOf,
  shiftMonth,
  todayIso,
} from "./occupancy";

/**
 * Цвет заявки по состоянию. Цвет — не единственный признак: номер заявки
 * написан в первой ночи, а состояние — в подписи ячейки и в легенде.
 */
const STATUS_TONES: Partial<Record<TravelBookingStatus, string>> = {
  new_request: "bg-gold/20",
  accepted: "bg-cyan/20",
  checked_in: "bg-magenta/20",
  // Стекло на светлой теме сливается с пустой ячейкой — берём приглушённый
  // текстовый токен: он виден в обеих темах и не спорит с живыми заявками.
  completed: "bg-text-2/20",
};

const LEGEND: TravelBookingStatus[] = [
  "new_request",
  "accepted",
  "checked_in",
  "completed",
];

const bookingLabel = (booking: TravelManagedOccupancyBooking) =>
  `№${booking.number} · ${booking.guestName} · ${TRAVEL_BOOKING_STATUS_LABELS[booking.status]}`;

/** Ночь → заявка. Две заявки на одну ночь в комнате — сбой, видна первая. */
function nightMap(
  bookings: readonly TravelManagedOccupancyBooking[],
): Map<string, TravelManagedOccupancyBooking> {
  const map = new Map<string, TravelManagedOccupancyBooking>();
  for (const booking of bookings) {
    for (const night of nightsOf(booking)) {
      if (!map.has(night)) map.set(night, booking);
    }
  }
  return map;
}

/**
 * Шахматка объекта: комнаты строками, дни месяца столбцами. Грузится по
 * месяцу; пока идёт запрос за новым месяцем, видно «Загружаем…», а не
 * прошлый месяц под новым заголовком.
 */
export function StayCalendarView({ stayId }: { stayId: string }) {
  const [today] = useState(todayIso);
  const [month, setMonth] = useState(() => monthStart(todayIso()));
  const [stayName, setStayName] = useState("");
  const [loaded, setLoaded] = useState<{
    key: string;
    data: TravelManagedOccupancyResponse | null;
    error: string | null;
  } | null>(null);

  const key = `${stayId}:${month}`;

  useEffect(() => {
    const controller = new AbortController();
    getTravelStay(stayId, controller.signal)
      .then((stay) => setStayName(stay.name))
      .catch(() => undefined);
    return () => controller.abort();
  }, [stayId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${stayId}:${month}`;
    getManagedStayOccupancy(
      stayId,
      { from: month, to: shiftMonth(month, 1) },
      controller.signal,
    )
      .then((data) => setLoaded({ key: requestKey, data, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: requestKey,
          data: null,
          error: cause instanceof Error ? cause.message : "Не загрузилось",
        });
      });
    return () => controller.abort();
  }, [stayId, month]);

  const current = loaded?.key === key ? loaded : null;
  const data = current?.data ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);

  // На телефоне в ширину влезает неделя, и таблица открывалась бы с 1-го
  // числа — а хозяину нужны ближайшие дни. Прокручиваем так, чтобы сегодня
  // стояло первым столбцом после закреплённой колонки комнат.
  useEffect(() => {
    const box = scrollRef.current;
    const todayCell = box?.querySelector<HTMLElement>("[data-today]");
    const roomCell = box?.querySelector<HTMLElement>("thead th");
    if (!box || !todayCell) return;
    box.scrollLeft = todayCell.offsetLeft - (roomCell?.offsetWidth ?? 0);
  }, [data]);
  const days = monthDays(month);
  const monthEnd = shiftMonth(month, 1);
  const unassigned = (data?.unassigned ?? []).filter(
    (booking) => booking.checkIn < monthEnd && booking.checkOut > month,
  );

  const linkClass =
    "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1";
  const navClass =
    "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-text-0">Календарь</h1>
        {stayName ? (
          <p className="mt-1 text-sm text-text-2">{stayName}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/travel/manage/${stayId}/bookings`} className={linkClass}>
            Заявки и комнаты
          </Link>
          <Link href={`/travel/manage/${stayId}/cash`} className={linkClass}>
            Касса
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className={navClass}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <p
          className="min-w-36 text-center font-display text-lg text-text-0"
          aria-live="polite"
        >
          {monthTitle(month)}
        </p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className={navClass}
          aria-label="Следующий месяц"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => setMonth(monthStart(today))}
          disabled={month === monthStart(today)}
          className={`${navClass} disabled:opacity-40`}
        >
          Сегодня
        </button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-1">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-4 w-6 rounded border border-glass-brd ${STATUS_TONES[status]}`}
            />
            {TRAVEL_BOOKING_STATUS_LABELS[status]}
          </li>
        ))}
      </ul>

      {current?.error ? (
        <p role="alert" className="text-sm text-text-0">
          {current.error}
        </p>
      ) : !data ? (
        <p className="text-sm text-text-2">Загружаем…</p>
      ) : data.rooms.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          Заведите комнаты на странице заявок — календарь строится по комнатам
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-2xl border border-glass-brd"
        >
          <table className="min-w-max border-collapse text-xs">
            <caption className="sr-only">
              Занятость комнат, {monthTitle(month)}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-bg-1 px-3 py-2 text-left font-normal text-text-2"
                >
                  Комната
                </th>
                {days.map((day) => {
                  const weekend = mondayOffset(day) >= 5;
                  const isToday = day === today;
                  return (
                    <th
                      key={day}
                      scope="col"
                      abbr={dayTitle(day)}
                      aria-label={`${dayTitle(day)}${isToday ? ", сегодня" : ""}`}
                      data-today={isToday ? "" : undefined}
                      className={`w-8 min-w-8 px-0 py-2 text-center font-mono font-normal ${
                        weekend ? "text-text-2" : "text-text-0"
                      } ${isToday ? "border-b-2 border-magenta" : ""}`}
                    >
                      {Number(day.slice(8))}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => {
                const nights = nightMap(room.bookings);
                return (
                  <tr key={room.roomId} className="border-t border-glass-brd">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-bg-1 px-3 py-2 text-left font-normal whitespace-nowrap text-text-0"
                    >
                      {room.roomLabel}
                      <span className="ml-1 text-text-2">
                        · мест: {room.capacity}
                      </span>
                    </th>
                    {days.map((day) => {
                      const booking = nights.get(day);
                      const isToday = day === today;
                      if (!booking) {
                        return (
                          <td
                            key={day}
                            aria-label={`${dayTitle(day)} — свободно`}
                            className={`h-9 border-l border-glass-brd ${
                              isToday ? "bg-magenta/5" : ""
                            }`}
                          />
                        );
                      }
                      // Номер — в первой ночи, видимой в этом месяце: заезд
                      // прошлого месяца иначе остался бы без подписи.
                      const first =
                        day === booking.checkIn ||
                        (day === month && booking.checkIn < month);
                      const label = `${dayTitle(day)} — ${bookingLabel(booking)}`;
                      return (
                        <td
                          key={day}
                          title={bookingLabel(booking)}
                          aria-label={label}
                          className={`h-9 border-l border-glass-brd px-0.5 text-center font-mono text-text-0 ${
                            STATUS_TONES[booking.status] ?? "bg-text-2/20"
                          } ${isToday ? "ring-1 ring-magenta ring-inset" : ""}`}
                        >
                          {first ? booking.number : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unassigned.length ? (
        <section>
          <h2 className="font-display text-lg text-text-0">Без комнаты</h2>
          <p className="mt-1 text-sm text-text-2">
            Заявки месяца, которым ещё не назначена комната.
          </p>
          <ul className="mt-3 space-y-2">
            {unassigned.map((booking) => (
              <li
                key={booking.bookingId}
                className="rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-sm"
              >
                <span className="text-text-0">
                  №{booking.number} · {booking.guestName}
                </span>
                <span className="block text-text-1">
                  {booking.checkIn} — {booking.checkOut} ·{" "}
                  {TRAVEL_BOOKING_STATUS_LABELS[booking.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
