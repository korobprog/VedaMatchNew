"use client";

import { useEffect, useState } from "react";
import {
  TRAVEL_STAY_KIND_LABELS,
  type AdminTravelStayDto,
  type TravelPlaceDto,
} from "@vedamatch/shared";
import {
  createAdminTravelPlace,
  getAdminTravelPlaces,
  getAdminTravelStays,
  removeAdminTravelPlace,
  setAdminTravelStayStatus,
} from "@/lib/travel-admin-api";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  published: "Опубликован",
  hidden_by_author: "Снят хозяином",
  removed_by_admin: "Снят администрацией",
};

export function AdminTravelView() {
  const [places, setPlaces] = useState<TravelPlaceDto[]>([]);
  const [stays, setStays] = useState<AdminTravelStayDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getAdminTravelPlaces(controller.signal),
      getAdminTravelStays(controller.signal),
    ])
      .then(([placesRes, staysRes]) => {
        setPlaces(placesRes.items);
        setStays(staysRes.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, []);

  async function reloadPlaces() {
    const res = await getAdminTravelPlaces();
    setPlaces(res.items);
  }

  async function addPlace(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createAdminTravelPlace({
        name,
        country,
        lat: Number(lat.replace(",", ".")),
        lng: Number(lng.replace(",", ".")),
      });
      setName("");
      setCountry("");
      setLat("");
      setLng("");
      await reloadPlaces();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Точка не добавилась");
    }
  }

  async function removePlace(id: string, placeName: string) {
    // Объекты останутся жить без метки на карте (SetNull), но карта у людей
    // меняется — спрашиваем.
    if (!window.confirm(`Убрать точку «${placeName}» с карты?`)) return;
    setError(null);
    try {
      await removeAdminTravelPlace(id);
      await reloadPlaces();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  async function moderate(id: string, remove: boolean) {
    setError(null);
    try {
      const updated = await setAdminTravelStayStatus(
        id,
        remove ? "removed_by_admin" : "draft",
      );
      setStays((current) =>
        current.map((stay) => (stay.id === id ? updated : stay)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    }
  }

  const fieldClass =
    "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

  return (
    <div className="mt-6 space-y-8">
      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="font-display text-xl text-text-0">Точки на карте</h2>
        <p className="mt-1 text-sm text-text-2">
          Города, храмы и места программ. Заводит администрация: две «Маяпуры» с
          разными координатами развалили бы карту.
        </p>

        <form onSubmit={addPlace} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-2">
            Название
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-2">
            Страна
            <input
              className={fieldClass}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-2">
            Широта
            <input
              className={fieldClass}
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-2">
            Долгота
            <input
              className={fieldClass}
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
          >
            Добавить точку
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {places.map((place) => (
            <li
              key={place.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-glass-brd p-3"
            >
              <span className="text-sm text-text-1">
                {place.name} · {place.country} · объектов: {place.stayCount}
              </span>
              <button
                type="button"
                onClick={() => void removePlace(place.id, place.name)}
                className="rounded-lg border border-glass-brd px-3 py-1 text-sm text-text-2"
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl text-text-0">Объекты размещения</h2>
        <ul className="mt-3 space-y-2">
          {stays.map((stay) => (
            <li
              key={stay.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-glass-brd p-3"
            >
              <span className="text-sm text-text-1">
                {stay.name} · {TRAVEL_STAY_KIND_LABELS[stay.kind]} ·{" "}
                {STATUS_LABELS[stay.status]}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void moderate(stay.id, true)}
                  className="rounded-lg border border-glass-brd px-3 py-1 text-sm text-text-2"
                >
                  Снять
                </button>
                <button
                  type="button"
                  onClick={() => void moderate(stay.id, false)}
                  className="rounded-lg border border-glass-brd px-3 py-1 text-sm text-text-2"
                >
                  Вернуть хозяину
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
