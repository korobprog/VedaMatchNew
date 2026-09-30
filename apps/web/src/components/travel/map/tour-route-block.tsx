"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TravelMapGuideDto, TravelMapTourDto } from "@vedamatch/shared";
import { getMyTravelMapGuide, getTravelMapTours } from "@/lib/travel-map-api";
import { TourCard } from "./tour-card";

/** Блок «Ближайшие наборы» на странице маршрута. */
export function TourRouteBlock({ routeId }: { routeId: string }) {
  const [tours, setTours] = useState<TravelMapTourDto[] | null>(null);
  const [guide, setGuide] = useState<TravelMapGuideDto | null | undefined>(
    undefined,
  );

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapTours({ routeId, upcoming: "1" }, controller.signal)
      .then(setTours)
      .catch(() => {
        if (!controller.signal.aborted) setTours([]);
      });
    getMyTravelMapGuide(controller.signal)
      .then(setGuide)
      .catch(() => {
        if (!controller.signal.aborted) setGuide(null);
      });
    return () => controller.abort();
  }, [routeId]);

  return (
    <section aria-label="Ближайшие наборы" className="mb-6">
      <h2 className="mb-2 font-display text-xl text-text-0">Ближайшие наборы</h2>
      {tours === null ? (
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      ) : tours.length === 0 ? (
        <p className="mb-2 text-sm text-text-2">
          Пока никто не назначил прогулку по этому маршруту.
        </p>
      ) : (
        <ul className="mb-2 grid gap-2 sm:grid-cols-2">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} showRoute={false} />
          ))}
        </ul>
      )}
      {guide === undefined ? null : guide ? (
        <Link
          href={`/travel/map/tours/new?route=${encodeURIComponent(routeId)}`}
          className="inline-block rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          Назначить прогулку
        </Link>
      ) : (
        <Link
          href="/travel/map/guides/me"
          className="text-sm text-cyan underline"
        >
          Стать экскурсоводом
        </Link>
      )}
    </section>
  );
}
