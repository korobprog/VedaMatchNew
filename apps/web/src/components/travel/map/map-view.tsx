"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TRAVEL_MAP_PLACE_GROUPS,
  TRAVEL_MAP_PLACE_GROUP_LABELS,
  travelMapPlaceKindOption,
  type TravelMapCommunityPointDto,
  type TravelMapPointDto,
  type TravelMapStayPointDto,
  TRAVEL_STAY_KIND_LABELS,
  TRAVEL_STAY_PAYMENT_LABELS,
  type TravelCurrency,
  type TravelStayKind,
  type TravelStayPayment,
} from "@vedamatch/shared";
import { getTravelMapPlace, getTravelMapPlaces } from "@/lib/travel-map-api";
import {
  buildFilterParams,
  inBounds,
  isGroupSelected,
  parseFilters,
  toggleGroup,
  type MapBounds,
} from "./map-filters";
import { formatPrice } from "../price";
import { PlacesMap, type FlyTarget } from "./places-map";

const chipClass = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-sm ${
    active
      ? "border-magenta bg-bg-2 text-text-0"
      : "border-glass-brd text-text-1"
  }`;

export function MapView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const focusId = searchParams.get("focus");

  const [qInput, setQInput] = useState(filters.q);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [points, setPoints] = useState<TravelMapPointDto[]>([]);
  const [communities, setCommunities] = useState<TravelMapCommunityPointDto[]>(
    [],
  );
  const [stays, setStays] = useState<TravelMapStayPointDto[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(focusId);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [initialCenter, setInitialCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [focusLoading, setFocusLoading] = useState(Boolean(focusId));
  const flyKey = useRef(0);

  // Место из ?focus= подгружаем один раз до создания карты: центр задаётся
  // при создании, а не прыжком после.
  useEffect(() => {
    if (!focusId) return;
    const controller = new AbortController();
    getTravelMapPlace(focusId, controller.signal)
      .then((place) => setInitialCenter({ lat: place.lat, lng: place.lng }))
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setFocusLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceFilters = useCallback(
    (next: typeof filters) => {
      const query = buildFilterParams(next);
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  // Поиск: в URL уходит с задержкой, чтобы каждая буква не будила запрос.
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
      getTravelMapPlaces(
        {
          minLat: round(bounds.south),
          maxLat: round(bounds.north),
          minLng: round(bounds.west),
          maxLng: round(bounds.east),
          kinds: kindsKey || undefined,
          q: filters.q.trim() || undefined,
          lineage: filters.lineage || undefined,
          communities: filters.communities ? "1" : "0",
          stays: filters.stays ? "1" : "0",
        },
        controller.signal,
      )
        .then((res) => {
          setPoints(res.points);
          setCommunities(res.communities);
          setStays(res.stays ?? []);
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
  }, [bounds, kindsKey, filters.q, filters.lineage, filters.communities, filters.stays]);

  const visible = useMemo(
    () => (bounds ? points.filter((p) => inBounds(p, bounds)) : points),
    [points, bounds],
  );

  const visibleStays = useMemo(
    () => (bounds ? stays.filter((s) => inBounds(s, bounds)) : stays),
    [stays, bounds],
  );

  function flyTo(point: { id?: string; lat: number; lng: number }) {
    if (point.id) setActiveId(point.id);
    flyKey.current += 1;
    setFlyTarget({ lat: point.lat, lng: point.lng, key: flyKey.current });
  }

  const allSelected = filters.kinds.length === 0;

  return (
    <section aria-label="Карта мест">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={allSelected}
          onClick={() => replaceFilters({ ...filters, kinds: [] })}
          className={chipClass(allSelected)}
        >
          Все
        </button>
        {TRAVEL_MAP_PLACE_GROUPS.map((group) => {
          const active = isGroupSelected(filters.kinds, group);
          return (
            <button
              key={group}
              type="button"
              aria-pressed={active}
              onClick={() =>
                replaceFilters({
                  ...filters,
                  kinds: toggleGroup(filters.kinds, group),
                })
              }
              className={chipClass(active)}
            >
              {TRAVEL_MAP_PLACE_GROUP_LABELS[group]}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1 basis-56">
          <span className="sr-only">Поиск места по названию</span>
          <input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Поиск по названию"
            maxLength={120}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={filters.communities}
            onChange={(event) =>
              replaceFilters({ ...filters, communities: event.target.checked })
            }
          />
          Общины
        </label>
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={filters.stays}
            onChange={(event) =>
              replaceFilters({ ...filters, stays: event.target.checked })
            }
          />
          Ночлег
        </label>
        <Link
          href="/travel/map/new"
          className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          Добавить место
        </Link>
        <Link
          href="/travel/map/routes"
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
        >
          Маршруты
        </Link>
        <Link
          href="/travel/map/guides"
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
        >
          Экскурсоводы
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

      {focusLoading ? (
        <div
          className="flex h-[min(70dvh,640px)] w-full items-center justify-center rounded-3xl border border-glass-brd text-sm text-text-2"
          role="status"
        >
          Загружаем карту…
        </div>
      ) : (
        <PlacesMap
          points={points}
          communities={communities}
          stays={stays}
          activeId={activeId}
          flyTarget={flyTarget}
          initialCenter={initialCenter}
          onBoundsChange={setBounds}
          onSelectPoint={(id) => {
            const point = points.find((p) => p.id === id);
            if (point) flyTo(point);
          }}
          onSelectStay={(id) => {
            const stay = stays.find((s) => s.id === id);
            if (stay) flyTo(stay);
          }}
          onOpenCommunity={(slug) =>
            router.push(`/communities/${encodeURIComponent(slug)}`)
          }
        />
      )}

      {truncated ? (
        <p className="mt-3 text-sm text-text-1" role="status">
          Мест слишком много для одного экрана — приблизьте карту, чтобы увидеть
          все.
        </p>
      ) : null}

      <h2 className="mb-2 mt-6 font-display text-xl text-text-0">
        В этой области
      </h2>
      {visible.length === 0 && visibleStays.length === 0 ? (
        <p className="text-sm text-text-2">
          Здесь пока нет мест. Сдвиньте карту или добавьте своё.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((point) => {
            const option = travelMapPlaceKindOption(point.kind);
            return (
              <li
                key={point.id}
                className={`rounded-2xl border bg-glass p-3 ${
                  point.id === activeId ? "border-gold" : "border-glass-brd"
                }`}
              >
                <button
                  type="button"
                  onClick={() => flyTo(point)}
                  aria-label={`Показать на карте: ${point.name}`}
                  className="block w-full text-left"
                >
                  <span className="block font-display text-base text-text-0">
                    <span aria-hidden="true">{option.icon} </span>
                    {point.name}
                  </span>
                  <span className="block text-xs text-text-2">
                    {option.label}
                    {point.city ? ` · ${point.city}` : ""}
                    {point.verified ? "" : " · не проверено"}
                    {point.stale ? " · давно не проверялось" : ""}
                  </span>
                </button>
                <Link
                  href={`/travel/map/places/${point.id}`}
                  aria-label={`Открыть карточку: ${point.name}`}
                  className="mt-2 inline-block text-sm text-cyan underline"
                >
                  Открыть карточку
                </Link>
              </li>
            );
          })}
          {visibleStays.map((stay) => {
            const kind =
              TRAVEL_STAY_KIND_LABELS[stay.kind as TravelStayKind] ?? "Ночлег";
            const payment =
              TRAVEL_STAY_PAYMENT_LABELS[stay.payment as TravelStayPayment] ??
              null;
            const price = formatPrice(
              stay.priceMinor,
              stay.currency as TravelCurrency,
            );
            return (
              <li
                key={`stay-${stay.id}`}
                className={`rounded-2xl border bg-glass p-3 ${
                  stay.id === activeId ? "border-gold" : "border-glass-brd"
                }`}
              >
                <button
                  type="button"
                  onClick={() => flyTo(stay)}
                  aria-label={`Показать на карте: ${stay.name}`}
                  className="block w-full text-left"
                >
                  <span className="block font-display text-base text-text-0">
                    <span aria-hidden="true">🛏️ </span>
                    {stay.name}
                  </span>
                  <span className="block text-xs text-text-2">
                    {kind}
                    {payment ? ` · ${payment}` : ""}
                    {price && stay.payment !== "seva" ? ` · ${price}` : ""}
                  </span>
                </button>
                <Link
                  href={`/travel/stays/${stay.id}`}
                  aria-label={`Открыть объект: ${stay.name}`}
                  className="mt-2 inline-block text-sm text-cyan underline"
                >
                  Открыть объект
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
