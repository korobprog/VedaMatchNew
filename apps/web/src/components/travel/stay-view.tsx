"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TRAVEL_STAY_KIND_LABELS,
  TRAVEL_STAY_PAYMENT_LABELS,
  type TravelStayDto,
} from "@vedamatch/shared";
import { createTravelBooking, getTravelStay } from "@/lib/travel-api";
import { priceLabel } from "./price";

/** Завтра в виде ГГГГ-ММ-ДД: заезд задним числом API не примет. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function StayView({ stayId }: { stayId: string }) {
  const [stay, setStay] = useState<TravelStayDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentNumber, setSentNumber] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTravelStay(stayId, controller.signal)
      .then(setStay)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error ? cause.message : "Объект не открывается",
        );
      });
    return () => controller.abort();
  }, [stayId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setFormError(null);
    try {
      const booking = await createTravelBooking({
        stayId,
        roomId: roomId || null,
        guestName,
        guestPhone,
        checkIn,
        checkOut,
        guests,
        comment: comment || null,
      });
      setSentNumber(booking.number);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Заявка не отправилась",
      );
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {loadError}
      </p>
    );
  }
  if (!stay) return <p className="text-sm text-text-2">Открываем…</p>;

  const fieldClass =
    "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-text-2">
          {TRAVEL_STAY_KIND_LABELS[stay.kind]}
          {stay.placeName ? ` · ${stay.placeName}` : ""}
        </p>
        <h1 className="font-display text-2xl text-text-0">{stay.name}</h1>
        {stay.address ? (
          <p className="mt-1 text-sm text-text-2">{stay.address}</p>
        ) : null}
        <p className="mt-2 text-sm text-text-1">
          {priceLabel(stay.priceMinor, stay.currency, stay.payment)} ·{" "}
          {TRAVEL_STAY_PAYMENT_LABELS[stay.payment]}
        </p>
        {stay.manageable ? (
          <Link
            href={`/travel/manage/${stay.id}/bookings`}
            className="mt-2 inline-block text-sm text-cyan underline"
          >
            Заявки на этот объект
          </Link>
        ) : null}
      </header>

      {stay.description ? (
        <p className="whitespace-pre-line text-sm text-text-1">
          {stay.description}
        </p>
      ) : null}

      {stay.sevaNote ? (
        <section className="rounded-2xl border border-glass-brd p-4">
          <h2 className="font-display text-base text-text-0">
            Какое служение ждут
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-text-1">
            {stay.sevaNote}
          </p>
        </section>
      ) : null}

      {sentNumber ? (
        <p
          role="status"
          className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1"
        >
          Заявка №{sentNumber} отправлена. Хозяин увидит её и ответит — решение
          придёт в колокольчик, а список заявок лежит в разделе «Мои заявки».
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-display text-lg text-text-0">Заявка на ночлег</h2>

          {stay.rooms.length ? (
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Комната
              <select
                className={fieldClass}
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              >
                <option value="">Пусть выберет хозяин</option>
                {stay.rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.building ? `${room.building}, ` : ""}
                    {room.number} — мест: {room.capacity}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Как вас зовут
              <input
                className={fieldClass}
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Телефон
              <input
                className={fieldClass}
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                required
                inputMode="tel"
                maxLength={40}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Заезд
              <input
                type="date"
                className={fieldClass}
                value={checkIn}
                onChange={(event) => setCheckIn(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Выезд
              <input
                type="date"
                className={fieldClass}
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Сколько гостей
              <input
                type="number"
                min={1}
                max={20}
                className={fieldClass}
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-2">
            Пожелания хозяину
            <textarea
              className={fieldClass}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              maxLength={1000}
            />
          </label>

          {formError ? (
            <p role="alert" className="text-sm text-magenta">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={sending}
            className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-60"
          >
            {sending ? "Отправляем…" : "Отправить заявку"}
          </button>
        </form>
      )}
    </div>
  );
}
