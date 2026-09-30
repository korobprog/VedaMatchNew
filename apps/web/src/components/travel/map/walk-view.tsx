"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  travelMapPlaceKindOption,
  type TravelMapRouteDto,
} from "@vedamatch/shared";
import { getTravelMapRoute } from "@/lib/travel-map-api";
import { PlacesMap } from "./places-map";
import { nextStopHint } from "./walk-geo";

type GeoState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "ok"; lat: number; lng: number }
  | { status: "error"; message: string };

function clampIndex(raw: string | null, count: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, count) - 1;
}

/** Полноэкранный пошаговый режим прогулки по маршруту. */
export function WalkView({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [route, setRoute] = useState<TravelMapRouteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [watchId, setWatchId] = useState<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [watchId]);

  const count = route?.stops.length ?? 0;
  const index = clampIndex(searchParams.get("stop"), count);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= count) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("stop", String(target + 1));
      router.replace(`${pathname}?${params}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [count, pathname, router, searchParams],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(el.tagName)) return;
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const stop = route?.stops[index];
  const next = route?.stops[index + 1];

  const fitTo = useMemo(
    () =>
      [stop, next]
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => ({ lat: s.lat, lng: s.lng })),
    [stop, next],
  );
  const line = useMemo(
    () => route?.stops.map((s) => ({ lat: s.lat, lng: s.lng })) ?? [],
    [route],
  );
  const numbered = useMemo(
    () =>
      route?.stops.map((s, i) => ({
        lat: s.lat,
        lng: s.lng,
        label: String(i + 1),
      })) ?? [],
    [route],
  );

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "error", message: "Геолокация недоступна на устройстве" });
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    setGeo({ status: "asking" });
    const wid = navigator.geolocation.watchPosition(
      (pos) =>
        setGeo({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) =>
        setGeo({
          status: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Доступ к геопозиции не разрешён"
              : "Не удалось определить, где вы",
        }),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    setWatchId(wid);
  }

  if (error && !route) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      </main>
    );
  }
  if (!route) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      </main>
    );
  }
  if (!stop) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-sm text-text-1">В маршруте нет остановок.</p>
        <Link
          href={`/travel/map/routes/${route.id}`}
          className="text-sm text-cyan underline"
        >
          К маршруту
        </Link>
      </main>
    );
  }

  const option = stop.place ? travelMapPlaceKindOption(stop.place.kind) : null;
  const { photoUrls, videoUrl, story } = stop.media;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <header>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-1" aria-live="polite">
            Остановка {index + 1} из {count}
          </p>
          <Link
            href={`/travel/map/routes/${route.id}`}
            className="text-sm text-cyan underline"
          >
            Выйти из прогулки
          </Link>
        </div>
        <h1 className="mt-1 font-display text-2xl text-text-0">
          {option ? <span aria-hidden="true">{option.icon} </span> : null}
          {stop.name}
        </h1>
        {option ? <p className="text-xs text-text-2">{option.label}</p> : null}
      </header>

      <PlacesMap
        polyline={line}
        numbered={numbered}
        fitTo={fitTo}
        ariaLabel={`Карта: остановка ${index + 1}, ${stop.name}`}
        className="h-[40dvh] min-h-52 w-full overflow-hidden rounded-3xl border border-glass-brd"
      />

      <section aria-label="Где вы" className="text-sm text-text-1">
        {geo.status === "ok" ? (
          next ? (
            <p role="status">
              {nextStopHint(
                { lat: geo.lat, lng: geo.lng },
                { lat: next.lat, lng: next.lng },
              )}
            </p>
          ) : (
            <p role="status">Это последняя остановка.</p>
          )
        ) : geo.status === "error" ? (
          <p role="alert" className="text-magenta">
            {geo.message}
          </p>
        ) : null}
        {geo.status !== "ok" ? (
          <button
            type="button"
            onClick={locate}
            disabled={geo.status === "asking"}
            className="mt-1 min-h-11 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-0"
          >
            {geo.status === "asking" ? "Ищем вас…" : "Где я"}
          </button>
        ) : null}
      </section>

      {photoUrls.length > 0 ? (
        <ul
          aria-label="Фото остановки"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4"
        >
          {photoUrls.map((url, i) => (
            <li key={url} className="shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Фото ${i + 1} из ${photoUrls.length}: ${stop.name}`}
                loading="lazy"
                className="h-48 w-64 max-w-[80vw] rounded-2xl object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {videoUrl ? (
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-full rounded-2xl bg-bg-1"
        />
      ) : null}

      {story ? (
        <p className="whitespace-pre-line text-base text-text-0">{story}</p>
      ) : null}
      {stop.note ? (
        <p className="whitespace-pre-line text-sm italic text-text-1">
          {stop.note}
        </p>
      ) : null}
      {stop.placeId ? (
        <Link
          href={`/travel/map/places/${stop.placeId}`}
          className="text-sm text-cyan underline"
        >
          Карточка места
        </Link>
      ) : null}

      {route.author ? (
        <aside
          aria-label="Автор маршрута"
          className="rounded-2xl border border-glass-brd bg-glass p-3 text-sm"
        >
          <p className="text-text-0">
            Автор: {route.author.name}
            {route.author.isAgent ? " · ИИ" : ""}
          </p>
          <Link
            href={`/chat/people/users/${route.author.id}`}
            className="text-cyan underline"
          >
            Написать / в контакты
          </Link>
        </aside>
      ) : null}

      <nav
        aria-label="Переход между остановками"
        className="sticky bottom-0 mt-auto flex gap-3 bg-bg-0 py-3"
      >
        <button
          type="button"
          className="travel-map-walk-nav"
          disabled={index === 0}
          aria-label="Назад, к предыдущей остановке"
          onClick={() => goTo(index - 1)}
        >
          ← Назад
        </button>
        <button
          type="button"
          className="travel-map-walk-nav"
          disabled={index === count - 1}
          aria-label="Дальше, к следующей остановке"
          onClick={() => goTo(index + 1)}
        >
          Дальше →
        </button>
      </nav>
    </main>
  );
}
