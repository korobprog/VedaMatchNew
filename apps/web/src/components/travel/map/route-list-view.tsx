"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TRAVEL_MAP_ROUTE_KINDS,
  TRAVEL_MAP_ROUTE_KIND_ICONS,
  TRAVEL_MAP_ROUTE_KIND_LABELS,
  type TravelMapRouteSummaryDto,
} from "@vedamatch/shared";
import { getTravelMapRoutes } from "@/lib/travel-map-api";
import { plural } from "@/lib/plural";
import { inBounds, type MapBounds } from "./map-filters";
import { PlacesMap, type FlyTarget } from "./places-map";
import {
  buildRouteFilterParams,
  parseRouteFilters,
  toggleRouteKind,
  type RouteFilters,
} from "./route-filters";
import { formatDistance } from "./route-geo";

const chipClass = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-sm ${
    active
      ? "border-magenta bg-bg-2 text-text-0"
      : "border-glass-brd text-text-1"
  }`;

export function stopsLabel(count: number): string {
  return `${count} ${plural(count, "остановка", "остановки", "остановок")}`;
}

export function RouteListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseRouteFilters(searchParams), [searchParams]);

  const [qInput, setQInput] = useState(filters.q);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [routes, setRoutes] = useState<TravelMapRouteSummaryDto[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const flyKey = useRef(0);

  const replaceFilters = useCallback(
    (next: RouteFilters) => {
      const query = buildRouteFilterParams(next);
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (qInput.trim() === filters.q.trim()) return;
    const timer = window.setTimeout(
      () => replaceFilters({ ...filters, q: qInput }),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [qInput, filters, replaceFilters]);

  const kindsKey = filters.kinds.join(",");
  useEffect(() => {
    if (!bounds) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const round = (n: number) => Math.round(n * 1e4) / 1e4;
      const q = filters.q.trim();
      // Поиск по названию — по всему миру: парикраму в Маяпуре ищут из
      // Москвы. Рамка карты ограничивает только просмотр без запроса.
      const bbox = q
        ? {}
        : {
            minLat: round(bounds.south),
            maxLat: round(bounds.north),
            minLng: round(bounds.west),
            maxLng: round(bounds.east),
          };
      getTravelMapRoutes(
        { ...bbox, kinds: kindsKey || undefined, q: q || undefined },
        controller.signal,
      )
        .then((res) => {
          setRoutes(res.routes);
          setTruncated(res.truncated);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : "Не загрузилось");
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bounds, kindsKey, filters.q]);

  const searching = filters.q.trim().length > 0;
  const visible = useMemo(
    () =>
      bounds && !searching
        ? routes.filter((r) => inBounds({ lat: r.startLat, lng: r.startLng }, bounds))
        : routes,
    [routes, bounds, searching],
  );

  // Старт маршрута рисуем обычной меткой места со значком вида.
  const points = useMemo(
    () =>
      visible.map((r) => ({
        id: r.id,
        kind: "other" as const,
        name: r.name,
        lat: r.startLat,
        lng: r.startLng,
        city: r.city,
        lineage: null,
        verified: true,
        photoUrl: null,
        stale: false,
      })),
    [visible],
  );

  const pointIcons = useMemo(
    () =>
      Object.fromEntries(
        visible.map((r) => [r.id, TRAVEL_MAP_ROUTE_KIND_ICONS[r.kind]]),
      ),
    [visible],
  );

  function focusRoute(route: TravelMapRouteSummaryDto) {
    setActiveId(route.id);
    flyKey.current += 1;
    setFlyTarget({
      lat: route.startLat,
      lng: route.startLng,
      key: flyKey.current,
    });
  }

  const allSelected = filters.kinds.length === 0;

  return (
    <section aria-label="Маршруты">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={allSelected}
          onClick={() => replaceFilters({ ...filters, kinds: [] })}
          className={chipClass(allSelected)}
        >
          Все
        </button>
        {TRAVEL_MAP_ROUTE_KINDS.map((kind) => {
          const active = filters.kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() =>
                replaceFilters({
                  ...filters,
                  kinds: toggleRouteKind(filters.kinds, kind),
                })
              }
              className={chipClass(active)}
            >
              <span aria-hidden="true">{TRAVEL_MAP_ROUTE_KIND_ICONS[kind]} </span>
              {TRAVEL_MAP_ROUTE_KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1 basis-56">
          <span className="sr-only">Поиск маршрута по названию</span>
          <input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Поиск по названию"
            maxLength={120}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <Link
          href="/travel/map/routes/new"
          className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          Новый маршрут
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <PlacesMap
        points={points}
        pointIcons={pointIcons}
        communities={[]}
        stays={[]}
        activeId={activeId}
        flyTarget={flyTarget}
        onBoundsChange={setBounds}
        onSelectPoint={(id) => {
          const route = routes.find((r) => r.id === id);
          if (route) focusRoute(route);
        }}
        ariaLabel="Карта маршрутов"
      />

      {truncated ? (
        <p className="mt-3 text-sm text-text-1" role="status">
          Маршрутов слишком много для одного экрана — приблизьте карту, чтобы
          увидеть все.
        </p>
      ) : null}

      <h2 className="mb-2 mt-6 font-display text-xl text-text-0">
        В этой области
      </h2>
      {visible.length === 0 ? (
        <p className="text-sm text-text-2">
          Здесь пока нет маршрутов. Сдвиньте карту или создайте свой.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((route) => (
            <li
              key={route.id}
              className={`rounded-2xl border bg-glass p-3 ${
                route.id === activeId ? "border-gold" : "border-glass-brd"
              }`}
            >
              <button
                type="button"
                onClick={() => focusRoute(route)}
                aria-label={`Показать на карте: ${route.name}`}
                className="block w-full text-left"
              >
                <span className="block font-display text-base text-text-0">
                  <span aria-hidden="true">
                    {TRAVEL_MAP_ROUTE_KIND_ICONS[route.kind]}{" "}
                  </span>
                  {route.name}
                </span>
                <span className="block text-xs text-text-2">
                  {TRAVEL_MAP_ROUTE_KIND_LABELS[route.kind]}
                  {route.city ? ` · ${route.city}` : ""}
                </span>
                <span className="block text-xs text-text-2">
                  {stopsLabel(route.stopsCount)} · {formatDistance(route.distanceKm)}
                  {route.author
                    ? ` · ${route.author.name}${route.author.isAgent ? " · ИИ" : ""}`
                    : ""}
                </span>
              </button>
              <Link
                href={`/travel/map/routes/${route.id}`}
                aria-label={`Открыть маршрут: ${route.name}`}
                className="mt-2 inline-block text-sm text-cyan underline"
              >
                Открыть маршрут
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
