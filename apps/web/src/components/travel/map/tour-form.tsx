"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TRAVEL_CURRENCIES,
  TRAVEL_CURRENCY_SIGNS,
  TRAVEL_MAP_TOUR_CAPACITY_MAX,
  TRAVEL_MAP_TOUR_MEETING_MAX,
  TRAVEL_MAP_TOUR_NOTE_MAX,
  TRAVEL_MAP_TOUR_PAYMENTS,
  TRAVEL_MAP_TOUR_PAYMENT_LABELS,
  TRAVEL_MAP_TOUR_TITLE_MAX,
  type TravelMapRouteSummaryDto,
  type TravelMapTourPayment,
} from "@vedamatch/shared";
import {
  createTravelMapTour,
  getMyTravelMapGuide,
  getTravelMapRoute,
  getTravelMapRoutes,
  getTravelMapTour,
  updateTravelMapTour,
} from "@/lib/travel-map-api";
import { isoToZonedLocal, zonedLocalToIso } from "./tour-format";

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zoneList(current: string): string[] {
  let zones: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    zones = supported ? supported("timeZone") : [];
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function TourForm({ tourId }: { tourId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const editing = Boolean(tourId);

  const [ready, setReady] = useState(false);
  const [hasGuide, setHasGuide] = useState(editing);
  const [routeId, setRouteId] = useState(params.get("route") ?? "");
  const [routeName, setRouteName] = useState("");
  const [routeQuery, setRouteQuery] = useState("");
  const [routeHits, setRouteHits] = useState<TravelMapRouteSummaryDto[]>([]);

  const [title, setTitle] = useState("");
  const [zone, setZone] = useState(browserZone);
  const [local, setLocal] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [capacity, setCapacity] = useState("");
  const [payment, setPayment] = useState<TravelMapTourPayment>("free");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>("rub");
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showHits = !routeId && routeQuery.trim().length >= 2;
  const zones = useMemo(() => zoneList(zone), [zone]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        if (tourId) {
          const tour = await getTravelMapTour(tourId, signal);
          setRouteId(tour.routeId ?? "");
          setRouteName(tour.routeName);
          setTitle(tour.title);
          const tz = tour.timezone ?? browserZone();
          setZone(tz);
          setLocal(isoToZonedLocal(tour.startsAt, tz));
          setMeetingPoint(tour.meetingPoint);
          setCapacity(tour.capacity === null ? "" : String(tour.capacity));
          setPayment(tour.payment);
          setPrice(tour.priceMinor === null ? "" : String(tour.priceMinor / 100));
          setCurrency(tour.currency);
          setNote(tour.note);
        } else {
          const guide = await getMyTravelMapGuide(signal);
          setHasGuide(Boolean(guide));
          const preset = params.get("route");
          if (preset) {
            const route = await getTravelMapRoute(preset, signal);
            setRouteName(route.name);
          }
        }
      } catch (cause) {
        if (signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
        // Не удалось узнать маршрут из query — пусть выберут заново.
        if (!tourId) setRouteId("");
      } finally {
        if (!signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  useEffect(() => {
    if (routeId || routeQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getTravelMapRoutes({ q: routeQuery.trim() }, controller.signal)
        .then((res) => setRouteHits(res.routes.slice(0, 8)))
        .catch(() => undefined);
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [routeQuery, routeId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = zonedLocalToIso(local, zone);
    if (!startsAt) {
      setError("Укажите дату и время.");
      return;
    }
    if (!editing && !routeId) {
      setError("Выберите маршрут.");
      return;
    }
    const capacityNumber = capacity.trim() ? Number(capacity) : null;
    if (
      capacityNumber !== null &&
      (!Number.isInteger(capacityNumber) ||
        capacityNumber < 1 ||
        capacityNumber > TRAVEL_MAP_TOUR_CAPACITY_MAX)
    ) {
      setError(`Вместимость — целое число от 1 до ${TRAVEL_MAP_TOUR_CAPACITY_MAX}.`);
      return;
    }
    let priceMinor: number | null = null;
    if (payment === "paid" && price.trim()) {
      const value = Number(price.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        setError("Цена — неотрицательное число.");
        return;
      }
      priceMinor = Math.round(value * 100);
    }
    const body = {
      title: title.trim() || undefined,
      startsAt,
      timezone: zone,
      meetingPoint: meetingPoint.trim(),
      capacity: capacityNumber,
      payment,
      priceMinor,
      currency,
      note: note.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      const tour = tourId
        ? await updateTravelMapTour(tourId, body)
        : await createTravelMapTour({ ...body, routeId });
      router.push(`/travel/map/tours/${tour.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось сохранить");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  if (!hasGuide) {
    return (
      <p
        role="status"
        className="rounded-xl border border-magenta bg-bg-1 p-3 text-sm text-text-0"
      >
        Сначала заполните профиль экскурсовода.{" "}
        <Link href="/travel/map/guides/me" className="text-cyan underline">
          Открыть профиль гида
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Набор на прогулку">
      <fieldset className="space-y-2">
        <legend className="text-sm text-text-1">Маршрут</legend>
        {routeId ? (
          <p className="text-sm text-text-0">
            {routeName || "Выбранный маршрут"}{" "}
            {editing ? null : (
              <button
                type="button"
                onClick={() => {
                  setRouteId("");
                  setRouteName("");
                }}
                className="text-cyan underline"
              >
                Выбрать другой
              </button>
            )}
          </p>
        ) : (
          <>
            <label className="block text-sm text-text-1">
              Найти маршрут по названию
              <input
                type="search"
                value={routeQuery}
                onChange={(e) => setRouteQuery(e.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            {showHits && routeHits.length > 0 ? (
              <ul aria-label="Найденные маршруты" className="space-y-1">
                {routeHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRouteId(hit.id);
                        setRouteName(hit.name);
                      }}
                      className="w-full rounded-xl border border-glass-brd px-3 py-2 text-left text-sm text-text-0"
                    >
                      {hit.name}
                      {hit.city ? ` · ${hit.city}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </fieldset>

      <label className="block text-sm text-text-1">
        Название (по умолчанию — название маршрута)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TRAVEL_MAP_TOUR_TITLE_MAX}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-text-1">
          Дата и время
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            required
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-text-1">
          Часовой пояс места встречи
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className={`${fieldClass} mt-1`}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-text-1">
        Где встречаемся
        <input
          value={meetingPoint}
          onChange={(e) => setMeetingPoint(e.target.value)}
          maxLength={TRAVEL_MAP_TOUR_MEETING_MAX}
          required
          className={`${fieldClass} mt-1`}
        />
      </label>

      <label className="block text-sm text-text-1">
        Вместимость (пусто — без ограничения)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={TRAVEL_MAP_TOUR_CAPACITY_MAX}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-text-1">Оплата</legend>
        <div className="flex flex-wrap gap-4">
          {TRAVEL_MAP_TOUR_PAYMENTS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-text-0">
              <input
                type="radio"
                name="tour-payment"
                value={value}
                checked={payment === value}
                onChange={() => setPayment(value)}
              />
              {TRAVEL_MAP_TOUR_PAYMENT_LABELS[value]}
            </label>
          ))}
        </div>
        {payment === "paid" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-text-1">
              Цена
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block text-sm text-text-1">
              Валюта
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${fieldClass} mt-1`}
              >
                {TRAVEL_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {TRAVEL_CURRENCY_SIGNS[c]} {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </fieldset>

      <label className="block text-sm text-text-1">
        Заметка для записавшихся
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={TRAVEL_MAP_TOUR_NOTE_MAX}
          rows={4}
          className={`${fieldClass} mt-1`}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-60"
        >
          {editing ? "Сохранить" : "Назначить прогулку"}
        </button>
        <Link
          href={tourId ? `/travel/map/tours/${tourId}` : "/travel/map/tours"}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
