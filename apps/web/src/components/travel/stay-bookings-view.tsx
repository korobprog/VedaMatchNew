"use client";

import { useEffect, useState } from "react";
import {
  TRAVEL_BOOKING_STATUS_LABELS,
  type TravelBookingDto,
} from "@vedamatch/shared";
import {
  addManagedRoom,
  decideTravelBooking,
  getStayBookings,
  getTravelStay,
  setManagedStayStatus,
} from "@/lib/travel-api";
import { formatPrice, nightsWord } from "./price";

type Decision = "accepted" | "declined" | "checked_in" | "completed";

/**
 * Что предложить нажать. Зеркало MANAGER_TRANSITIONS на бэкенде: правило одно,
 * но кнопка, которой на сервере соответствует отказ, — это не проверка прав, а
 * подсказка. Сервер всё равно проверяет сам.
 */
const NEXT_STEPS: Record<string, { status: Decision; label: string }[]> = {
  new_request: [
    { status: "accepted", label: "Принять" },
    { status: "declined", label: "Отклонить" },
  ],
  accepted: [
    { status: "checked_in", label: "Заселить" },
    { status: "declined", label: "Отказать" },
  ],
  checked_in: [{ status: "completed", label: "Проживание завершено" }],
};

export function StayBookingsView({ stayId }: { stayId: string }) {
  const [stayName, setStayName] = useState("");
  const [publicCode, setPublicCode] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [items, setItems] = useState<TravelBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomBuilding, setRoomBuilding] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getTravelStay(stayId, controller.signal),
      getStayBookings(stayId, controller.signal),
    ])
      .then(([stay, bookings]) => {
        setStayName(stay.name);
        setPublicCode(stay.publicCode);
        setStatus(stay.status);
        setItems(bookings.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [stayId]);

  async function decide(id: string, next: Decision) {
    const reason =
      next === "declined"
        ? window.prompt("Почему отказываете? Гостю нужно понять, искать ли другое место")
        : null;
    if (next === "declined" && !reason) return;

    setBusyId(id);
    setError(null);
    try {
      const updated = await decideTravelBooking(id, next, reason ?? undefined);
      setItems((current) =>
        (current ?? []).map((item) => (item.id === id ? updated : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  }

  async function publish() {
    setError(null);
    try {
      const next = status === "published" ? "hidden_by_author" : "published";
      await setManagedStayStatus(stayId, next);
      setStatus(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  async function addRoom(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await addManagedRoom(stayId, {
        number: roomNumber,
        building: roomBuilding,
      });
      setRoomNumber("");
      setRoomBuilding("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Комната не добавилась");
    }
  }

  const fieldClass =
    "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-text-0">
          {stayName || "Объект"}
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Публичный код: {publicCode || "—"} ·{" "}
          {status === "published" ? "опубликован" : "не опубликован"}
        </p>
        <button
          type="button"
          onClick={() => void publish()}
          className="mt-2 rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          {status === "published" ? "Снять с публикации" : "Опубликовать"}
        </button>
      </header>

      <form onSubmit={addRoom} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Корпус
          <input
            className={fieldClass}
            value={roomBuilding}
            onChange={(event) => setRoomBuilding(event.target.value)}
            placeholder="Необязательно"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Номер комнаты
          <input
            className={fieldClass}
            value={roomNumber}
            onChange={(event) => setRoomNumber(event.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
        >
          Добавить комнату
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="font-display text-lg text-text-0">Заявки</h2>
        {!items ? (
          <p className="mt-2 text-sm text-text-2">Загружаем…</p>
        ) : items.length ? (
          <ul className="mt-3 space-y-3">
            {items.map((booking) => (
              <li
                key={booking.id}
                className="rounded-2xl border border-glass-brd bg-glass p-4"
              >
                <p className="text-xs uppercase tracking-wide text-text-2">
                  №{booking.number} ·{" "}
                  {TRAVEL_BOOKING_STATUS_LABELS[booking.status]}
                </p>
                <p className="mt-1 font-display text-lg text-text-0">
                  {booking.guestName}
                </p>
                <p className="mt-1 text-sm text-text-1">
                  {booking.checkIn} — {booking.checkOut},{" "}
                  {nightsWord(booking.nights)} · гостей: {booking.guests}
                  {booking.roomLabel ? ` · ${booking.roomLabel}` : ""}
                </p>
                <p className="mt-1 text-sm text-text-2">
                  Телефон: {booking.guestPhone}
                  {booking.totalMinor !== null
                    ? ` · ${formatPrice(booking.totalMinor, booking.currency)}`
                    : ""}
                </p>
                {booking.comment ? (
                  <p className="mt-1 text-sm text-text-1">{booking.comment}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(NEXT_STEPS[booking.status] ?? []).map((step) => (
                    <button
                      key={step.status}
                      type="button"
                      onClick={() => void decide(booking.id, step.status)}
                      disabled={busyId === booking.id}
                      className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 disabled:opacity-60"
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-text-2">Заявок пока нет.</p>
        )}
      </section>
    </div>
  );
}
