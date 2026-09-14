"use client";

import { FormEvent, useState } from "react";
import {
  TRAVEL_REVIEW_TEXT_MAX,
  TRAVEL_REVIEWABLE_STATUSES,
  type TravelBookingDto,
} from "@vedamatch/shared";
import { removeBookingReview, saveBookingReview } from "@/lib/travel-api";
import { starsLabel, starsText } from "./rating";

/**
 * Отзыв о проживании в заявке. Появляется после заезда; оставленный отзыв
 * виден свёрнутым и правится той же формой.
 */
export function BookingReview({
  booking,
  onChange,
}: {
  booking: TravelBookingDto;
  onChange: (updated: TravelBookingDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(booking.review?.rating ?? 0);
  const [text, setText] = useState(booking.review?.text ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    !(TRAVEL_REVIEWABLE_STATUSES as readonly string[]).includes(booking.status)
  ) {
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) {
      setError("Поставьте оценку — от одной до пяти звёзд");
      return;
    }
    setPending(true);
    setError(null);
    try {
      onChange(await saveBookingReview(booking.id, { rating, text }));
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Отзыв не сохранился");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("Удалить отзыв?")) return;
    setPending(true);
    try {
      await removeBookingReview(booking.id);
      onChange({ ...booking, review: null });
      setRating(0);
      setText("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Отзыв не удалился");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {booking.review ? (
          <>
            <span aria-hidden="true" className="text-gold">
              {starsText(booking.review.rating)}
            </span>
            <span className="sr-only">
              Ваш отзыв: {starsLabel(booking.review.rating)}
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-text-0 underline underline-offset-4"
            >
              Изменить отзыв
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl border border-magenta px-3 py-2 text-text-0"
          >
            Оставить отзыв
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-3 space-y-2 rounded-2xl border border-glass-brd p-3"
    >
      <fieldset>
        <legend className="text-sm text-text-1">Оценка</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-lg px-1 text-2xl leading-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta"
            >
              <input
                type="radio"
                name={`review-rating-${booking.id}`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={value <= rating ? "text-gold" : "text-text-2"}
              >
                {value <= rating ? "★" : "☆"}
              </span>
              <span className="sr-only">{starsLabel(value)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm text-text-1">
        Что понравилось или нет
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={TRAVEL_REVIEW_TEXT_MAX}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить отзыв"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
        >
          Отмена
        </button>
        {booking.review ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={pending}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>
    </form>
  );
}
