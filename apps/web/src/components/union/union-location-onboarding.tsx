"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoSearchResult, UserProfile } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function UnionLocationOnboarding() {
  const router = useRouter();
  const [country, setCountry] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [selectedLocation, setSelectedLocation] =
    useState<GeoSearchResult | null>(null);
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const city = cityQuery.trim();
    const selectedCountry = country.trim();
    if (
      city.length < 2 ||
      selectedCountry.length < 2 ||
      (city === selectedLocation?.city &&
        selectedCountry === selectedLocation.country)
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchPending(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: city,
          country: selectedCountry,
        });
        const response = await fetch(`${API_URL}/geo/search?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await response.text());
        setResults((await response.json()) as GeoSearchResult[]);
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }
        setResults([]);
        setError("Не удалось найти город. Попробуйте ещё раз.");
      } finally {
        setSearchPending(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cityQuery, country, selectedLocation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLocation) {
      setError("Выберите город из списка подсказок.");
      return;
    }

    setSavePending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          homeLocation: {
            ...selectedLocation,
            country: selectedLocation.country ?? country.trim(),
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const profile = (await response.json()) as UserProfile;
      if (!profile.homeLocation?.country) {
        throw new Error("Локация не была сохранена");
      }
      router.push("/union");
      router.refresh();
    } catch {
      setError("Не удалось сохранить локацию. Попробуйте ещё раз.");
    } finally {
      setSavePending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Страна
          </span>
          <input
            type="text"
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setSelectedLocation(null);
              setResults([]);
            }}
            placeholder="Например, Россия"
            autoComplete="country-name"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </label>

        <div className="relative">
          <label
            htmlFor="union-location-city"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Город
          </label>
          <input
            id="union-location-city"
            type="text"
            value={cityQuery}
            onChange={(event) => {
              setCityQuery(event.target.value);
              setSelectedLocation(null);
              setResults([]);
            }}
            placeholder="Начните вводить город"
            autoComplete="address-level2"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {results.map((item) => (
                <button
                  key={`${item.lat}-${item.lon}-${item.city}-${item.country}`}
                  type="button"
                  onClick={() => {
                    setSelectedLocation(item);
                    setCityQuery(item.city);
                    setCountry(item.country ?? country.trim());
                    setResults([]);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-amber-50 dark:hover:bg-zinc-800"
                >
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {item.city}
                    {item.country ? `, ${item.country}` : ""}
                  </span>
                  {locationDetails(item) && (
                    <span className="block text-xs text-zinc-500">
                      {locationDetails(item)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-5 text-sm">
        {searchPending && <p className="text-zinc-500">Ищем город...</p>}
        {selectedLocation && (
          <p className="text-emerald-700 dark:text-emerald-300">
            Выбрано: {selectedLocation.city}, {selectedLocation.country}
          </p>
        )}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={!selectedLocation || savePending}
        className="mt-4 rounded-xl bg-amber-600 px-5 py-3 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {savePending ? "Сохраняем..." : "Сохранить и продолжить"}
      </button>

      <p className="mt-4 text-xs text-zinc-500">
        Мы сохраняем только выбранный город и примерные координаты. Видимость
        города для других пользователей настраивается в профиле Union.
      </p>
    </form>
  );
}

function locationDetails(item: GeoSearchResult): string {
  const excluded = new Set(
    [item.city, item.country]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()),
  );

  return (item.displayName ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !excluded.has(part.toLocaleLowerCase()))
    .join(", ");
}
