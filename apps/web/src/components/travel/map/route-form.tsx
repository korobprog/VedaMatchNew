"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  TRAVEL_MAP_ROUTE_DESCRIPTION_MAX,
  TRAVEL_MAP_ROUTE_KINDS,
  TRAVEL_MAP_ROUTE_KIND_ICONS,
  TRAVEL_MAP_ROUTE_KIND_LABELS,
  TRAVEL_MAP_ROUTE_NAME_MAX,
  TRAVEL_MAP_ROUTE_STOPS_MAX,
  TRAVEL_MAP_ROUTE_STOPS_MIN,
  TRAVEL_MAP_ROUTE_STOP_NOTE_MAX,
  travelMapPlaceKindOption,
  type TravelMapPointDto,
  type TravelMapRouteKind,
  type TravelMapRouteStopInput,
} from "@vedamatch/shared";
import {
  createTravelMapRoute,
  getTravelMapPlaces,
  getTravelMapRoute,
  updateTravelMapRoute,
} from "@/lib/travel-map-api";
import { PlacesMap } from "./places-map";
import { formatDistance, routeDistanceKm } from "./route-geo";

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
const smallButton =
  "rounded-lg border border-glass-brd px-2 py-1 text-sm text-text-1";
const chipClass = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-sm ${
    active
      ? "border-magenta bg-bg-2 text-text-0"
      : "border-glass-brd text-text-1"
  }`;

interface DraftStop extends TravelMapRouteStopInput {
  key: number;
}

export function RouteForm({ routeId }: { routeId?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<TravelMapRouteKind>("parikrama");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Поиск места.
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<TravelMapPointDto[]>([]);
  // Точка по карте.
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [pickedName, setPickedName] = useState("");

  useEffect(() => {
    if (!routeId) return;
    const controller = new AbortController();
    getTravelMapRoute(routeId, controller.signal)
      .then((route) => {
        setKind(route.kind);
        setName(route.name);
        setDescription(route.description);
        setCity(route.city ?? "");
        setCountry(route.country ?? "");
        setStops(
          route.stops.map((s, i) => ({
            key: i + 1,
            id: s.id,
            placeId: s.placeId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            note: s.note,
          })),
        );
        setNextKey(route.stops.length + 1);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [routeId]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getTravelMapPlaces(
        { q, communities: "0", stays: "0" },
        controller.signal,
      )
        .then((res) => setHits(res.points.slice(0, 8)))
        .catch(() => undefined);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const shownHits = search.trim().length >= 2 ? hits : [];

  const line = useMemo(
    () => stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    [stops],
  );
  const numbered = useMemo(
    () => stops.map((s, i) => ({ lat: s.lat, lng: s.lng, label: String(i + 1) })),
    [stops],
  );
  // Кадр подгоняем при смене числа остановок, а не при каждой правке заметки.
  const fitTo = useMemo(() => line, [stops.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const distance = routeDistanceKm(line);
  const full = stops.length >= TRAVEL_MAP_ROUTE_STOPS_MAX;

  function addStop(stop: TravelMapRouteStopInput) {
    if (full) return;
    setStops((prev) => [...prev, { ...stop, key: nextKey }]);
    setNextKey((n) => n + 1);
  }

  function addPlace(point: TravelMapPointDto) {
    addStop({
      placeId: point.id,
      name: point.name,
      lat: point.lat,
      lng: point.lng,
    });
    setSearch("");
    setHits([]);
  }

  function confirmPicked() {
    if (!picked || !pickedName.trim()) return;
    addStop({
      placeId: null,
      name: pickedName.trim().slice(0, TRAVEL_MAP_ROUTE_NAME_MAX),
      lat: picked.lat,
      lng: picked.lng,
    });
    setPicked(null);
    setPickedName("");
    setPickMode(false);
  }

  function move(index: number, delta: -1 | 1) {
    setStops((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patchNote(index: number, note: string) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, note } : s)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Дайте маршруту название");
      return;
    }
    if (stops.length < TRAVEL_MAP_ROUTE_STOPS_MIN) {
      setError(`Нужно минимум ${TRAVEL_MAP_ROUTE_STOPS_MIN} остановки`);
      return;
    }
    const body = {
      kind,
      name: name.trim(),
      description: description.trim(),
      city: city.trim() || null,
      country: country.trim() || null,
      stops: stops.map((s) => ({
        id: s.id ?? undefined,
        placeId: s.placeId ?? null,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        note: s.note?.trim() || undefined,
      })),
    };
    setSaving(true);
    try {
      const saved = routeId
        ? await updateTravelMapRoute(routeId, body)
        : await createTravelMapRoute(body);
      router.push(`/travel/map/routes/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось сохранить");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Маршрут">
      <fieldset>
        <legend className="mb-2 text-sm text-text-1">Вид маршрута</legend>
        <div className="flex flex-wrap gap-2">
          {TRAVEL_MAP_ROUTE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={chipClass(kind === k)}
            >
              <span aria-hidden="true">{TRAVEL_MAP_ROUTE_KIND_ICONS[k]} </span>
              {TRAVEL_MAP_ROUTE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm text-text-1">
        Название
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TRAVEL_MAP_ROUTE_NAME_MAX}
          required
          className={`${fieldClass} mt-1`}
        />
      </label>

      <label className="block text-sm text-text-1">
        Описание
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TRAVEL_MAP_ROUTE_DESCRIPTION_MAX}
          rows={4}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-text-1">
          Город
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={120}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-text-1">
          Страна
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={120}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>

      <section aria-label="Остановки" className="space-y-3">
        <h2 className="font-display text-xl text-text-0">Остановки</h2>

        <div className="relative">
          <label className="block text-sm text-text-1">
            Найти место на карте
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название храма, кафе, святого места"
              disabled={full}
              className={`${fieldClass} mt-1`}
            />
          </label>
          {shownHits.length > 0 ? (
            <ul className="mt-1 divide-y divide-glass-brd rounded-xl border border-glass-brd bg-bg-1">
              {shownHits.map((point) => {
                const option = travelMapPlaceKindOption(point.kind);
                return (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => addPlace(point)}
                      aria-label={`Добавить остановку: ${point.name}`}
                      className="block w-full px-3 py-2 text-left text-sm text-text-0"
                    >
                      <span aria-hidden="true">{option.icon} </span>
                      {point.name}
                      {point.city ? (
                        <span className="text-text-2"> · {point.city}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={pickMode}
            disabled={full}
            onClick={() => {
              setPickMode((v) => !v);
              setPicked(null);
              setPickedName("");
            }}
            className={chipClass(pickMode)}
          >
            Добавить точку по карте
          </button>
          {pickMode ? (
            <span className="text-sm text-text-1">
              Нажмите на карту, чтобы поставить точку.
            </span>
          ) : null}
        </div>

        {pickMode && picked ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 basis-56 text-sm text-text-1">
              Название точки
              <input
                value={pickedName}
                onChange={(e) => setPickedName(e.target.value)}
                maxLength={TRAVEL_MAP_ROUTE_NAME_MAX}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <button
              type="button"
              onClick={confirmPicked}
              disabled={!pickedName.trim()}
              className={chipClass(false)}
            >
              Добавить точку
            </button>
          </div>
        ) : null}

        <p className="text-sm text-text-1" aria-live="polite">
          Длина по прямым: {formatDistance(distance)}
        </p>

        <PlacesMap
          polyline={line}
          numbered={numbered}
          fitTo={fitTo}
          pickMode={pickMode}
          pickValue={picked}
          onPick={(lat, lng) => setPicked({ lat, lng })}
          ariaLabel="Карта построения маршрута"
        />

        {stops.length === 0 ? (
          <p className="text-sm text-text-2">
            Остановок пока нет. Нужно минимум {TRAVEL_MAP_ROUTE_STOPS_MIN}.
          </p>
        ) : (
          <ol className="space-y-2">
            {stops.map((stop, index) => (
              <li
                key={stop.key}
                className="rounded-2xl border border-glass-brd bg-glass p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-magenta text-xs text-text-0"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-0">
                    {stop.name}
                  </span>
                  <button
                    type="button"
                    className={smallButton}
                    disabled={index === 0}
                    aria-label={`Поднять выше: ${stop.name}`}
                    onClick={() => move(index, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    disabled={index === stops.length - 1}
                    aria-label={`Опустить ниже: ${stop.name}`}
                    onClick={() => move(index, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={`Убрать остановку: ${stop.name}`}
                    onClick={() =>
                      setStops((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    ✕
                  </button>
                </div>
                <label className="mt-2 block text-xs text-text-2">
                  <span className="sr-only">Заметка к остановке {stop.name}</span>
                  <input
                    value={stop.note ?? ""}
                    onChange={(e) => patchNote(index, e.target.value)}
                    maxLength={TRAVEL_MAP_ROUTE_STOP_NOTE_MAX}
                    placeholder="Заметка: что здесь, как лучше пройти"
                    className={fieldClass}
                  />
                </label>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0"
      >
        {saving ? "Сохраняем…" : routeId ? "Сохранить" : "Создать маршрут"}
      </button>
    </form>
  );
}
