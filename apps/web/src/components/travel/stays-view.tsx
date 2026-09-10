"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  TRAVEL_STAY_KIND_LABELS,
  TRAVEL_STAY_KINDS,
  type TravelPlaceDto,
  type TravelStayCardDto,
  type TravelStayKind,
  type TravelStayPayment,
} from "@vedamatch/shared";
import { getTravelPlaces, getTravelStays } from "@/lib/travel-api";
import { StayCard } from "./stay-card";

// Leaflet трогает window при загрузке модуля — на сервере он не рендерится.
const TravelMap = dynamic(
  () => import("./travel-map").then((mod) => mod.TravelMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 w-full animate-pulse rounded-2xl border border-glass-brd bg-bg-2" />
    ),
  },
);

const PAYMENTS: { value: TravelStayPayment | ""; label: string }[] = [
  { value: "", label: "Любая оплата" },
  { value: "paid", label: "За плату" },
  { value: "seva", label: "За служение" },
];

export function StaysView() {
  const [places, setPlaces] = useState<TravelPlaceDto[]>([]);
  const [stays, setStays] = useState<TravelStayCardDto[]>([]);
  const [placeId, setPlaceId] = useState("");
  const [kind, setKind] = useState<TravelStayKind | "">("");
  const [payment, setPayment] = useState<TravelStayPayment | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getTravelPlaces(controller.signal)
      .then((res) => setPlaces(res.items))
      .catch(() => {
        // Карта — не единственный способ найти жильё: список ниже работает и
        // без неё, поэтому молчим, а не пугаем ошибкой во весь экран.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Запрос — в асинхронной функции, а не телом эффекта: синхронный setState
    // в эффекте даёт каскад рендеров, и правило react-hooks это ловит.
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTravelStays(
          {
            placeId: placeId || undefined,
            kind: kind || undefined,
            payment: payment || undefined,
          },
          controller.signal,
        );
        setStays(res.items);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Не удалось загрузить список",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [placeId, kind, payment]);

  const selectPlace = useCallback((id: string) => setPlaceId(id), []);
  const selectClass =
    "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

  return (
    <div className="space-y-6">
      {places.length ? (
        <TravelMap places={places} onSelectPlace={selectPlace} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Место
          <select
            className={selectClass}
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
          >
            <option value="">Везде</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-2">
          Вид жилья
          <select
            className={selectClass}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as TravelStayKind | "")
            }
          >
            <option value="">Любой</option>
            {TRAVEL_STAY_KINDS.map((value) => (
              <option key={value} value={value}>
                {TRAVEL_STAY_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-2">
          Оплата
          <select
            className={selectClass}
            value={payment}
            onChange={(event) =>
              setPayment(event.target.value as TravelStayPayment | "")
            }
          >
            {PAYMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-text-2">Ищем…</p>
      ) : stays.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {stays.map((stay) => (
            <StayCard key={stay.id} stay={stay} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-2">
          Здесь пока никто не предложил ночлег. Если вы принимаете гостей —
          заведите своё жильё в разделе «Моё жильё».
        </p>
      )}
    </div>
  );
}
