"use client";

import { useState } from "react";
import type { TravelOccupancyRange } from "@vedamatch/shared";
import {
  busyNights,
  dayTitle,
  mondayOffset,
  monthDays,
  monthStart,
  monthTitle,
  nightsOf,
  shiftMonth,
} from "./occupancy";

const WEEKDAYS = [
  { short: "Пн", full: "понедельник" },
  { short: "Вт", full: "вторник" },
  { short: "Ср", full: "среда" },
  { short: "Чт", full: "четверг" },
  { short: "Пт", full: "пятница" },
  { short: "Сб", full: "суббота" },
  { short: "Вс", full: "воскресенье" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Месячная сетка занятости выбранной комнаты. Только показывает: даты гость
 * вводит в полях формы, а сетка отвечает на вопрос «свободно ли тогда».
 *
 * Месяц следует за датой заезда, пока гость не полистал сам: `offset`
 * запоминается вместе с заездом, к которому относится, и сбрасывается, когда
 * заезд меняют, — без эффекта, который переписывал бы состояние после рендера.
 */
export function RoomAvailability({
  roomLabel,
  busy,
  checkIn,
  checkOut,
  today,
  windowTo,
}: {
  roomLabel: string;
  busy: readonly TravelOccupancyRange[];
  checkIn: string;
  checkOut: string;
  today: string;
  /** Конец загруженного окна: дальше занятость неизвестна, листать незачем. */
  windowTo: string;
}) {
  const [shift, setShift] = useState({ base: checkIn, offset: 0 });
  const offset = shift.base === checkIn ? shift.offset : 0;
  const anchor =
    ISO_DATE.test(checkIn) && checkIn >= today ? checkIn : today;
  const month = shiftMonth(monthStart(anchor), offset);

  const firstMonth = monthStart(today);
  const canPrev = month > firstMonth;
  const canNext = shiftMonth(month, 1) < windowTo;

  const taken = busyNights(busy);
  const chosen = new Set(
    ISO_DATE.test(checkIn) && ISO_DATE.test(checkOut)
      ? nightsOf({ checkIn, checkOut })
      : [],
  );

  const days = monthDays(month);
  const cells: (string | null)[] = [
    ...Array.from({ length: mondayOffset(month) }, () => null),
    ...days,
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const move = (delta: number) =>
    setShift({ base: checkIn, offset: offset + delta });

  const navClass =
    "rounded-lg border border-glass-brd px-2 py-1 text-sm text-text-1 disabled:opacity-40";

  return (
    <section
      aria-label={`Занятость комнаты ${roomLabel}`}
      className="rounded-2xl border border-glass-brd p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canPrev}
          className={navClass}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <p className="text-sm text-text-0" aria-live="polite">
          {monthTitle(month)}
        </p>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={!canNext}
          className={navClass}
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>

      <table className="mt-2 w-full table-fixed border-separate border-spacing-1 text-center text-sm">
        <caption className="sr-only">
          Комната {roomLabel}, {monthTitle(month)}
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday.short}
                scope="col"
                abbr={weekday.full}
                className="text-xs font-normal text-text-2"
              >
                {weekday.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean) ?? "empty"}>
              {week.map((day, index) => {
                if (!day) return <td key={`blank-${index}`} />;
                const isBusy = taken.has(day);
                const isChosen = chosen.has(day);
                const isPast = day < today;
                const states = [
                  isBusy ? "занято" : null,
                  isChosen ? "выбрано" : null,
                  isPast ? "прошло" : null,
                ].filter(Boolean);
                const label = states.length
                  ? `${dayTitle(day)} — ${states.join(", ")}`
                  : dayTitle(day);
                const tone = isBusy
                  ? "bg-magenta/20 text-text-0 line-through"
                  : isChosen
                    ? "bg-cyan/20 text-text-0"
                    : isPast
                      ? "text-text-2"
                      : "text-text-1";
                return (
                  <td
                    key={day}
                    aria-label={label}
                    title={label}
                    className={`rounded-md py-1 font-mono ${tone} ${
                      isBusy && isChosen ? "ring-2 ring-magenta" : ""
                    }`}
                  >
                    {Number(day.slice(8))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
        <li className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block rounded bg-magenta/20 px-1 font-mono text-text-0 line-through"
          >
            12
          </span>
          занято
        </li>
        <li className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block rounded bg-cyan/20 px-1 font-mono text-text-0"
          >
            12
          </span>
          ваши даты
        </li>
      </ul>
    </section>
  );
}
