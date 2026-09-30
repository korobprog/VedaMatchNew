"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TravelMapTourDto } from "@vedamatch/shared";
import { getTravelMapTours } from "@/lib/travel-map-api";
import { TourCard } from "./tour-card";

const chipClass = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-sm ${
    active
      ? "border-magenta bg-bg-2 text-text-0"
      : "border-glass-brd text-text-1"
  }`;

export function TourListView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const routeId = params.get("routeId") ?? params.get("route") ?? "";
  const guideId = params.get("guideId") ?? "";
  const city = params.get("city") ?? "";
  const upcoming = params.get("upcoming") !== "0";

  const [cityInput, setCityInput] = useState(city);
  const [tours, setTours] = useState<TravelMapTourDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function replace(next: Record<string, string | undefined>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (cityInput.trim() === city.trim()) return;
    const timer = window.setTimeout(
      () => replace({ city: cityInput.trim() || undefined }),
      400,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityInput, city]);

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapTours(
      {
        upcoming: upcoming ? "1" : "0",
        routeId: routeId || undefined,
        guideId: guideId || undefined,
        city: city.trim() || undefined,
      },
      controller.signal,
    )
      .then((list) => {
        setTours(list);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [upcoming, routeId, guideId, city]);

  return (
    <section aria-label="Наборы на прогулки">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Какие наборы показывать" className="flex gap-2">
          <button
            type="button"
            aria-pressed={upcoming}
            onClick={() => replace({ upcoming: undefined })}
            className={chipClass(upcoming)}
          >
            Предстоящие
          </button>
          <button
            type="button"
            aria-pressed={!upcoming}
            onClick={() => replace({ upcoming: "0" })}
            className={chipClass(!upcoming)}
          >
            Все
          </button>
        </div>
        <label className="min-w-0 flex-1 basis-48">
          <span className="sr-only">Город</span>
          <input
            type="search"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Город"
            maxLength={120}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <Link
          href="/travel/map/guides"
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
        >
          Экскурсоводы
        </Link>
      </div>

      {routeId || guideId ? (
        <p className="mb-3 text-sm text-text-1">
          Показаны наборы {routeId ? "по одному маршруту" : "одного гида"}.{" "}
          <button
            type="button"
            onClick={() => replace({ routeId: undefined, route: undefined, guideId: undefined })}
            className="text-cyan underline"
          >
            Сбросить
          </button>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {tours === null && !error ? (
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      ) : null}
      {tours && tours.length === 0 ? (
        <p className="text-sm text-text-2">
          Наборов пока нет. Гид может назначить прогулку на странице маршрута.
        </p>
      ) : null}
      {tours && tours.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
