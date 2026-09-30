"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LINEAGES,
  LINEAGE_GROUPS,
  LINEAGE_GROUP_LABELS,
  TRAVEL_MAP_LINEAGE_KINDS,
  TRAVEL_MAP_PLACE_ADDRESS_MAX,
  TRAVEL_MAP_PLACE_DESCRIPTION_MAX,
  TRAVEL_MAP_PLACE_GROUPS,
  TRAVEL_MAP_PLACE_GROUP_LABELS,
  TRAVEL_MAP_PLACE_HOURS_MAX,
  TRAVEL_MAP_PLACE_KIND_OPTIONS,
  TRAVEL_MAP_PLACE_NAME_MAX,
  type CreateTravelMapPlaceRequest,
  type GeoSearchResult,
  type LineageId,
  type TravelMapPlaceKind,
} from "@vedamatch/shared";
import {
  createTravelMapPlace,
  getTravelMapPlace,
  searchGeo,
  updateTravelMapPlace,
} from "@/lib/travel-map-api";
import { PlacesMap, type FlyTarget } from "./places-map";

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
const labelClass = "flex flex-col gap-1 text-xs text-text-2";

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function PlaceForm({ placeId }: { placeId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(placeId));
  const [kind, setKind] = useState<TravelMapPlaceKind>("temple");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [lineage, setLineage] = useState<LineageId | "">("");
  const [openingHours, setOpeningHours] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSearchResult[]>([]);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [initialCenter, setInitialCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    getTravelMapPlace(placeId, controller.signal)
      .then((place) => {
        setKind(place.kind);
        setName(place.name);
        setDescription(place.description);
        setAddress(place.address);
        setCity(place.city);
        setCountry(place.country);
        setLat(place.lat);
        setLng(place.lng);
        setLineage(place.lineage ?? "");
        setOpeningHours(place.openingHours ?? "");
        setWebsite(place.website ?? "");
        setPhone(place.phone ?? "");
        setTelegram(place.telegram ?? "");
        setInitialCenter({ lat: place.lat, lng: place.lng });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [placeId]);

  // Подсказки адреса с задержкой 350 мс; сброс — внутри таймера.
  useEffect(() => {
    const query = addressQuery.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      searchGeo(query, controller.signal)
        .then(setSuggestions)
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [addressQuery]);

  function pickSuggestion(item: GeoSearchResult) {
    setLat(item.lat);
    setLng(item.lon);
    setCity(item.city || null);
    setCountry(item.country || null);
    setAddress((item.displayName ?? "").slice(0, TRAVEL_MAP_PLACE_ADDRESS_MAX));
    setAddressQuery("");
    setSuggestions([]);
    setFlyTarget({ lat: item.lat, lng: item.lon, key: (flyTarget?.key ?? 0) + 1 });
  }

  const showLineage = TRAVEL_MAP_LINEAGE_KINDS.includes(kind);
  const lineageGroups = useMemo(
    () =>
      LINEAGE_GROUPS.map((group) => ({
        group,
        items: LINEAGES.filter((item) => item.group === group),
      })),
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lat === null || lng === null) {
      setError("Укажите место на карте: найдите адрес или щёлкните по карте.");
      return;
    }
    setPending(true);
    setError(null);
    const body: CreateTravelMapPlaceRequest = {
      kind,
      name: name.trim(),
      lat,
      lng,
      description: description.trim(),
      address: address.trim(),
      city,
      country,
      lineage: showLineage && lineage ? lineage : null,
      openingHours: orNull(openingHours),
      website: orNull(website),
      phone: orNull(phone),
      telegram: orNull(telegram),
    };
    try {
      const place = placeId
        ? await updateTravelMapPlace(placeId, body)
        : await createTravelMapPlace(body);
      router.push(`/travel/map/places/${place.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
      setPending(false);
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
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm text-text-1">Что это за место</legend>
        <div className="space-y-3">
          {TRAVEL_MAP_PLACE_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1 text-xs text-text-2">
                {TRAVEL_MAP_PLACE_GROUP_LABELS[group]}
              </p>
              <div className="flex flex-wrap gap-2">
                {TRAVEL_MAP_PLACE_KIND_OPTIONS.filter(
                  (o) => o.group === group,
                ).map((option) => {
                  const active = option.id === kind;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setKind(option.id)}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        active
                          ? "border-magenta bg-bg-2 text-text-0"
                          : "border-glass-brd text-text-1"
                      }`}
                    >
                      <span aria-hidden="true">{option.icon} </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <label className={labelClass}>
        Название
        <input
          required
          value={name}
          maxLength={TRAVEL_MAP_PLACE_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </label>

      <div>
        <label className={labelClass}>
          Найти адрес
          <input
            value={addressQuery}
            onChange={(event) => setAddressQuery(event.target.value)}
            placeholder="Город, улица, дом"
            autoComplete="off"
            className={fieldClass}
          />
        </label>
        {suggestions.length > 0 ? (
          <ul className="mt-2 space-y-1 rounded-xl border border-glass-brd bg-bg-1 p-1">
            {suggestions.map((item) => (
              <li key={`${item.lat},${item.lon},${item.displayName}`}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(item)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-1"
                >
                  {item.displayName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mb-2 mt-3 text-xs text-text-2">
          или щёлкните по карте — метку можно перетащить.
        </p>
        <PlacesMap
          pickMode
          pickValue={lat !== null && lng !== null ? { lat, lng } : null}
          onPick={(nextLat, nextLng) => {
            setLat(nextLat);
            setLng(nextLng);
          }}
          flyTarget={flyTarget}
          initialCenter={initialCenter}
          ariaLabel="Карта для выбора точки места"
          className="h-[min(50dvh,420px)] w-full overflow-hidden rounded-3xl border border-glass-brd"
        />
        <p className="mt-2 text-xs text-text-2" aria-live="polite">
          {lat !== null && lng !== null
            ? `Координаты: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
            : "Точка ещё не выбрана."}
        </p>
      </div>

      <label className={labelClass}>
        Адрес
        <input
          value={address}
          maxLength={TRAVEL_MAP_PLACE_ADDRESS_MAX}
          onChange={(event) => setAddress(event.target.value)}
          className={fieldClass}
        />
      </label>

      {showLineage ? (
        <label className={labelClass}>
          Линия
          <select
            value={lineage}
            onChange={(event) => setLineage(event.target.value as LineageId | "")}
            className={fieldClass}
          >
            <option value="">Не указана</option>
            {lineageGroups.map(({ group, items }) => (
              <optgroup key={group} label={LINEAGE_GROUP_LABELS[group]}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ) : null}

      <label className={labelClass}>
        Описание
        <textarea
          value={description}
          rows={5}
          maxLength={TRAVEL_MAP_PLACE_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
          className={fieldClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Часы работы
          <input
            value={openingHours}
            maxLength={TRAVEL_MAP_PLACE_HOURS_MAX}
            onChange={(event) => setOpeningHours(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Сайт
          <input
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://"
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Телефон
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Телеграм
          <input
            value={telegram}
            onChange={(event) => setTelegram(event.target.value)}
            placeholder="@имя"
            className={fieldClass}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-60"
      >
        {pending ? "Сохраняем…" : placeId ? "Сохранить" : "Добавить место"}
      </button>
    </form>
  );
}
