"use client";

import { useEffect, useState } from "react";
import type { AdminTravelReviewDto } from "@vedamatch/shared";
import {
  getAdminTravelReviews,
  setAdminTravelReviewStatus,
} from "@/lib/travel-admin-api";
import { starsLabel, starsText } from "./rating";

/**
 * Модерация отзывов «Ночлега»: свежие отзывы всех объектов. Скрытый отзыв
 * уходит из карточки и из средней оценки, но не стирается — его можно вернуть.
 */
export function AdminTravelReviews() {
  const [items, setItems] = useState<AdminTravelReviewDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getAdminTravelReviews(controller.signal)
      .then((res) => setItems(res.items))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, []);

  async function toggle(review: AdminTravelReviewDto) {
    const next =
      review.status === "published" ? "hidden_by_admin" : "published";
    setBusyId(review.id);
    setError(null);
    try {
      await setAdminTravelReviewStatus(review.id, next);
      setItems((current) =>
        (current ?? []).map((item) =>
          item.id === review.id ? { ...item, status: next } : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="font-display text-xl text-text-0">Отзывы гостей</h2>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      {!items ? (
        <p className="mt-2 text-sm text-text-2">Загружаем…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-text-2">Отзывов пока нет.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-glass-brd bg-glass p-3"
            >
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                <span aria-hidden="true" className="text-gold">
                  {starsText(review.rating)}
                </span>
                <span className="sr-only">{starsLabel(review.rating)}</span>
                <span className="text-text-0">{review.stayName}</span>
                <span className="text-text-2">
                  {review.authorName ?? "Гость"}
                </span>
                {review.status === "hidden_by_admin" ? (
                  <span className="rounded-lg border border-magenta px-1.5 text-xs text-text-0">
                    Скрыт
                  </span>
                ) : null}
              </p>
              {review.text ? (
                <p className="mt-1 whitespace-pre-line text-sm text-text-1">
                  {review.text}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void toggle(review)}
                disabled={busyId === review.id}
                className="mt-2 rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 disabled:opacity-60"
              >
                {review.status === "published" ? "Скрыть" : "Вернуть"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
