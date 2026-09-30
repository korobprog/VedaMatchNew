"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TRAVEL_MAP_ROUTE_KIND_ICONS,
  TRAVEL_MAP_ROUTE_KIND_LABELS,
  travelMapPlaceKindOption,
  type TravelMapRouteDto,
} from "@vedamatch/shared";
import { deleteTravelMapRoute, getTravelMapRoute } from "@/lib/travel-map-api";
import { PlacesMap } from "./places-map";
import { formatDistance } from "./route-geo";
import { stopsLabel } from "./route-list-view";

const buttonClass =
  "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1";

export function RouteView({ id }: { id: string }) {
  const router = useRouter();
  const [route, setRoute] = useState<TravelMapRouteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapRoute(id, controller.signal)
      .then(setRoute)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [id]);

  const line = useMemo(
    () => route?.stops.map((s) => ({ lat: s.lat, lng: s.lng })) ?? [],
    [route],
  );
  const numbered = useMemo(
    () =>
      route?.stops.map((s, index) => ({
        lat: s.lat,
        lng: s.lng,
        label: String(index + 1),
      })) ?? [],
    [route],
  );

  async function remove() {
    if (!route) return;
    if (!window.confirm(`Удалить маршрут «${route.name}»? Это нельзя отменить.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteTravelMapRoute(route.id);
      router.push("/travel/map/routes");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось удалить");
      setBusy(false);
    }
  }

  if (error && !route) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!route) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  return (
    <article aria-label={route.name}>
      <Link href="/travel/map/routes" className="text-sm text-cyan underline">
        Все маршруты
      </Link>

      {route.status === "hidden" ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-magenta bg-bg-1 p-3 text-sm text-text-0"
        >
          Маршрут скрыт от других.
          {route.hiddenReason ? ` Причина: ${route.hiddenReason}` : ""}
        </p>
      ) : null}

      <header className="mt-3">
        <p className="text-sm text-text-2">
          <span aria-hidden="true">{TRAVEL_MAP_ROUTE_KIND_ICONS[route.kind]} </span>
          {TRAVEL_MAP_ROUTE_KIND_LABELS[route.kind]}
        </p>
        <h1 className="font-display text-3xl text-text-0">{route.name}</h1>
        <p className="mt-1 text-sm text-text-1">
          {[route.city, route.country].filter(Boolean).join(", ")}
          {route.city || route.country ? " · " : ""}
          {formatDistance(route.distanceKm)} · {stopsLabel(route.stopsCount)}
        </p>
        {route.author ? (
          <p className="text-xs text-text-2">
            Автор: {route.author.name}
            {route.author.isAgent ? " · ИИ" : ""}
          </p>
        ) : null}
      </header>

      <div className="my-4">
        <PlacesMap
          polyline={line}
          numbered={numbered}
          fitTo={line}
          ariaLabel={`Карта маршрута: ${route.name}`}
        />
      </div>

      {route.canEdit ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={`/travel/map/routes/${route.id}/edit`}
            className={buttonClass}
          >
            Изменить
          </Link>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            aria-label={`Удалить маршрут: ${route.name}`}
            className={buttonClass}
          >
            Удалить
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {route.description ? (
        <p className="mb-6 whitespace-pre-line text-sm text-text-1">
          {route.description}
        </p>
      ) : null}

      <h2 className="mb-2 font-display text-xl text-text-0">Остановки</h2>
      <ol className="space-y-2">
        {route.stops.map((stop, index) => {
          const option = stop.place ? travelMapPlaceKindOption(stop.place.kind) : null;
          return (
            <li
              key={stop.id}
              className="flex gap-3 rounded-2xl border border-glass-brd bg-glass p-3"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-magenta text-xs text-text-0"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-text-0">
                  <span className="sr-only">Остановка {index + 1}: </span>
                  {option ? <span aria-hidden="true">{option.icon} </span> : null}
                  {stop.placeId ? (
                    <Link
                      href={`/travel/map/places/${stop.placeId}`}
                      className="underline"
                    >
                      {stop.name}
                    </Link>
                  ) : (
                    stop.name
                  )}
                </p>
                {option ? (
                  <p className="text-xs text-text-2">
                    {option.label}
                    {stop.place?.stale ? " · давно не проверялось" : ""}
                  </p>
                ) : null}
                {stop.note ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-text-1">
                    {stop.note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
