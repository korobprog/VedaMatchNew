"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, MapPin } from "lucide-react";
import type { NoticeKind, NoticeMapResponse } from "@vedamatch/shared";
import { NoticesApiError, getNoticesMap } from "@/lib/notices-api";
import { plural } from "@/lib/plural";
import { NOTICE_KIND_CHIPS, NOTICE_KIND_ORDER } from "./notice-labels";
import type { MapArea, NoticesMapHandle } from "./notices-map";

// Leaflet трогает `window` при вычислении модуля, поэтому карта грузится
// только на клиенте. `ssr: false` тут обязателен, а не оптимизация.
const NoticesMap = dynamic(
  () => import("./notices-map").then((m) => m.NoticesMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-glass-brd text-sm text-text-1">
        <Loader2 className="mr-2 size-4 animate-spin" /> Загружаем карту…
      </div>
    ),
  },
);

const DEBOUNCE_MS = 400;

export function NoticesMapPanel() {
  const router = useRouter();
  const [kind, setKind] = useState<NoticeKind | null>(null);
  const [data, setData] = useState<NoticeMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<MapArea | null>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mapHandleRef = useRef<NoticesMapHandle>(null);

  const load = useCallback(
    (area: MapArea, kindFilter: NoticeKind | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      getNoticesMap(
        { ...area, kind: kindFilter ?? undefined },
        controller.signal,
      )
        .then(setData)
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(
            e instanceof NoticesApiError ? e.message : "Карта не загрузилась",
          );
        });
    },
    [],
  );

  // Карту двигают непрерывно: без дебаунса каждый пиксель превращался бы
  // в запрос.
  const onAreaChange = useCallback(
    (area: MapArea) => {
      areaRef.current = area;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => load(area, kind),
        DEBOUNCE_MS,
      );
    },
    [load, kind],
  );

  // Смена фильтра перезапрашивает ту же рамку, не дожидаясь движения карты.
  useEffect(() => {
    if (areaRef.current) load(areaRef.current, kind);
  }, [kind, load]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  return (
    <div>
      <div className="glass mb-4 flex flex-wrap gap-2 rounded-2xl border border-glass-brd p-4">
        {NOTICE_KIND_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setKind(kind === option ? null : option)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              kind === option
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {NOTICE_KIND_CHIPS[option]}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <NoticesMap
        ref={mapHandleRef}
        data={data}
        onAreaChange={onAreaChange}
        onSelectNotice={(id) => router.push(`/notices/${id}`)}
      />

      <MapVisibleList
        data={data}
        onSelectCluster={(lat, lon) => mapHandleRef.current?.flyTo(lat, lon)}
      />
    </div>
  );
}

/**
 * Список того же самого, что сейчас нарисовано на карте — не отдельная
 * выборка, а текстовое представление `data`. На агрегате по городу список
 * повторяет клик по метке (то же `flyTo`); на отдельных точках — ведёт на
 * само объявление, тоже как клик по метке. Своего поведения список не
 * придумывает нигде.
 */
function MapVisibleList({
  data,
  onSelectCluster,
}: {
  data: NoticeMapResponse | null;
  onSelectCluster: (lat: number, lon: number) => void;
}) {
  if (!data) return null;

  const empty =
    data.mode === "clusters" ? data.clusters.length === 0 : data.points.length === 0;
  if (empty) {
    return (
      <p className="mt-4 text-sm text-text-2">
        В этой части карты пока ничего нет — подвиньте её или отдалите.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <h2 className="mb-2 text-sm font-medium text-text-1">Видно на карте</h2>
      <ul className="space-y-1.5">
        {data.mode === "clusters"
          ? data.clusters.map((cluster) => (
              <li key={`${cluster.city}-${cluster.country ?? ""}`}>
                <button
                  type="button"
                  onClick={() => onSelectCluster(cluster.lat, cluster.lon)}
                  className="glass flex w-full items-center justify-between gap-3 rounded-xl border border-glass-brd px-4 py-2.5 text-left text-sm transition hover:border-magenta/30"
                >
                  <span className="flex items-center gap-2 text-text-0">
                    <MapPin aria-hidden className="size-4 shrink-0 text-text-2" />
                    {cluster.city}
                    {cluster.country && (
                      <span className="text-text-2">, {cluster.country}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-text-2">
                    {cluster.count}{" "}
                    {plural(cluster.count, "объявление", "объявления", "объявлений")}
                  </span>
                </button>
              </li>
            ))
          : data.points.map((point) => (
              <li key={point.id}>
                <Link
                  href={`/notices/${point.id}`}
                  className="glass flex items-center gap-3 rounded-xl border border-glass-brd px-4 py-2.5 text-sm transition hover:border-magenta/30"
                >
                  <span
                    aria-hidden
                    // Та же логика меток, что на карте: сплошная точка — настоящий
                    // адрес, пунктирная — центр города. Один взгляд на список
                    // должен читаться так же, как один взгляд на карту.
                    className={`size-2 shrink-0 rounded-full ${
                      point.precision === "exact"
                        ? "bg-magenta"
                        : "border border-dashed border-magenta bg-transparent"
                    }`}
                  />
                  <span className="text-text-2">{NOTICE_KIND_CHIPS[point.kind]}</span>
                  <span className="truncate text-text-0">{point.title}</span>
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}
