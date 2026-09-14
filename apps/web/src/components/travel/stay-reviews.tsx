"use client";

import { useEffect, useState } from "react";
import type { TravelReviewsResponse } from "@vedamatch/shared";
import { getStayReviews } from "@/lib/travel-api";
import { ratingLabel, starsLabel, starsText } from "./rating";

const reviewDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Отзывы гостей в карточке объекта: средняя оценка и последние отзывы. */
export function StayReviews({ stayId }: { stayId: string }) {
  const [data, setData] = useState<TravelReviewsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getStayReviews(stayId, controller.signal)
      .then(setData)
      // Отзывы — дополнение к карточке: не загрузились — карточка остаётся.
      .catch(() => undefined);
    return () => controller.abort();
  }, [stayId]);

  if (!data) return null;

  return (
    <section aria-labelledby="stay-reviews-title" className="space-y-3">
      <h2 id="stay-reviews-title" className="font-display text-lg text-text-0">
        Отзывы гостей
      </h2>
      <p className="text-sm text-text-1">{ratingLabel(data.summary)}</p>
      {data.items.length ? (
        <ul className="space-y-2">
          {data.items.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-glass-brd bg-glass p-3"
            >
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                <span aria-hidden="true" className="text-gold">
                  {starsText(review.rating)}
                </span>
                <span className="sr-only">{starsLabel(review.rating)}</span>
                <span className="text-text-0">
                  {review.authorName ?? "Гость"}
                </span>
                <span className="text-xs text-text-2">
                  {reviewDate.format(new Date(review.createdAt))}
                </span>
              </p>
              {review.text ? (
                <p className="mt-1 whitespace-pre-line text-sm text-text-1">
                  {review.text}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
