"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { NoticeKind, NoticeMapResponse } from "@vedamatch/shared";
import { NoticesApiError, getNoticesMap } from "@/lib/notices-api";
import { NOTICE_KIND_CHIPS, NOTICE_KIND_ORDER } from "./notice-labels";
import type { MapArea } from "./notices-map";

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
        data={data}
        onAreaChange={onAreaChange}
        onSelectNotice={(id) => router.push(`/notices/${id}`)}
      />
    </div>
  );
}
