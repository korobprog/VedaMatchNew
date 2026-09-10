"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TRAVEL_BOOKING_STATUS_LABELS,
  type TravelBookingDto,
} from "@vedamatch/shared";
import { cancelTravelBooking, getMyTravelBookings } from "@/lib/travel-api";
import { formatPrice, nightsWord } from "./price";

/** Заявку можно отменить, пока заезд не состоялся. */
const CANCELABLE = new Set(["new_request", "accepted"]);

export function BookingsView() {
  const [items, setItems] = useState<TravelBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMyTravelBookings(controller.signal)
      .then((res) => setItems(res.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Заявки не загрузились",
        );
      });
    return () => controller.abort();
  }, []);

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await cancelTravelBooking(id);
      setItems((current) =>
        (current ?? []).map((item) => (item.id === id ? updated : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Отмена не прошла");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !items) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!items) return <p className="text-sm text-text-2">Загружаем…</p>;
  if (!items.length) {
    return (
      <p className="text-sm text-text-2">
        Заявок пока нет.{" "}
        <Link href="/travel" className="text-cyan underline">
          Посмотреть, где можно остановиться
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((booking) => (
          <li
            key={booking.id}
            className="rounded-2xl border border-glass-brd bg-glass p-4"
          >
            <p className="text-xs uppercase tracking-wide text-text-2">
              Заявка №{booking.number} ·{" "}
              {TRAVEL_BOOKING_STATUS_LABELS[booking.status]}
            </p>
            <p className="mt-1 font-display text-lg text-text-0">
              {booking.stayName}
            </p>
            <p className="mt-1 text-sm text-text-1">
              {booking.checkIn} — {booking.checkOut}, {nightsWord(booking.nights)}
              {booking.roomLabel ? ` · ${booking.roomLabel}` : ""}
            </p>
            {booking.totalMinor !== null ? (
              <p className="mt-1 text-sm text-text-1">
                К оплате: {formatPrice(booking.totalMinor, booking.currency)}
              </p>
            ) : null}
            {booking.declineReason ? (
              <p className="mt-1 text-sm text-text-2">
                Причина отказа: {booking.declineReason}
              </p>
            ) : null}
            {CANCELABLE.has(booking.status) ? (
              <button
                type="button"
                onClick={() => void cancel(booking.id)}
                disabled={busyId === booking.id}
                className="mt-3 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 disabled:opacity-60"
              >
                {busyId === booking.id ? "Отменяем…" : "Отменить заявку"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
