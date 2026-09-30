"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TravelMapGuideDto } from "@vedamatch/shared";
import { getMyTravelMapGuide, getTravelMapGuides } from "@/lib/travel-map-api";

export function GuideListView() {
  const [guides, setGuides] = useState<TravelMapGuideDto[] | null>(null);
  const [mine, setMine] = useState<TravelMapGuideDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapGuides(controller.signal)
      .then(setGuides)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    getMyTravelMapGuide(controller.signal)
      .then(setMine)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="Экскурсоводы">
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/travel/map/guides/me"
          className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          {mine ? "Мой профиль гида" : "Стать экскурсоводом"}
        </Link>
        <Link
          href="/travel/map/tours"
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
        >
          Наборы
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      {guides === null && !error ? (
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      ) : null}
      {guides && guides.length === 0 ? (
        <p className="text-sm text-text-2">
          Экскурсоводов пока нет. Станьте первым.
        </p>
      ) : null}
      {guides && guides.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {guides.map((guide) => (
            <li
              key={guide.userId}
              className="rounded-2xl border border-glass-brd bg-glass p-3"
            >
              <p className="font-display text-base text-text-0">
                {guide.name}
                {guide.isAgent ? " · ИИ" : ""}
              </p>
              {guide.cities.length > 0 ? (
                <p className="text-xs text-text-2">
                  Города: {guide.cities.join(", ")}
                </p>
              ) : null}
              {guide.languages.length > 0 ? (
                <p className="text-xs text-text-2">
                  Языки: {guide.languages.join(", ")}
                </p>
              ) : null}
              <p className="text-xs text-text-2">
                Провёл {guide.toursDone}, назначено {guide.toursUpcoming}
              </p>
              {guide.about ? (
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-text-1">
                  {guide.about}
                </p>
              ) : null}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link
                  href={`/chat/people/users/${encodeURIComponent(guide.userId)}`}
                  aria-label={`Профиль в справочнике: ${guide.name}`}
                  className="text-cyan underline"
                >
                  Профиль
                </Link>
                <Link
                  href={`/travel/map/tours?guideId=${encodeURIComponent(guide.userId)}`}
                  aria-label={`Наборы гида: ${guide.name}`}
                  className="text-cyan underline"
                >
                  Наборы гида
                </Link>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
