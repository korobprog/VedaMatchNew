"use client";

import { useEffect, useState } from "react";
import type {
  GeoSearchResult,
  SpiritualStage,
  UnionFormat,
} from "@vedamatch/shared";
import { unionLanguageOptions } from "./dictionaries";
import { intentionLabels, intentionTypes } from "./labels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const stageLabels: Record<SpiritualStage, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

const formatLabels: Record<UnionFormat, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  any: "Любой",
};

const radiusOptions = [25, 50, 100, 250, 500, 1000, 3000];

export function RecommendationFilters({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const initialCity = first(params.city) ?? "";
  const [cityQuery, setCityQuery] = useState(initialCity);
  const [selectedCity, setSelectedCity] = useState<GeoSearchResult | null>(
    initialCity
      ? {
          city: initialCity,
          country: first(params.country),
          lat: Number(first(params.lat) ?? NaN),
          lon: Number(first(params.lon) ?? NaN),
          displayName: initialCity,
        }
      : null,
  );
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || query === selectedCity?.displayName) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPending(true);
      try {
        const res = await fetch(
          `${API_URL}/geo/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(await res.text());
        setResults((await res.json()) as GeoSearchResult[]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
      } finally {
        setPending(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cityQuery, selectedCity?.displayName]);

  return (
    <form
      action="/union/recommendations"
      className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="page" value="1" />
      {selectedCity?.country && (
        <input type="hidden" name="country" value={selectedCity.country} />
      )}
      {Number.isFinite(selectedCity?.lat) && (
        <input type="hidden" name="lat" value={String(selectedCity?.lat)} />
      )}
      {Number.isFinite(selectedCity?.lon) && (
        <input type="hidden" name="lon" value={String(selectedCity?.lon)} />
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Select
          name="intention"
          label="Цель"
          defaultValue={first(params.intention)}
          options={[
            ["", "Любая"],
            ...intentionTypes.map(
              (type): [string, string] => [type, intentionLabels[type]],
            ),
          ]}
        />
        <Select
          name="stage"
          label="Этап"
          defaultValue={first(params.stage)}
          options={[
            ["", "Любой"],
            ...(Object.entries(stageLabels) as Array<[string, string]>),
          ]}
        />
        <Select
          name="format"
          label="Формат"
          defaultValue={first(params.format)}
          options={Object.entries(formatLabels) as Array<[string, string]>}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_1fr]">
        <div className="relative">
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Город
          </label>
          <input
            name="city"
            type="text"
            value={cityQuery}
            onChange={(event) => {
              setCityQuery(event.target.value);
              setSelectedCity(null);
              setResults([]);
            }}
            placeholder="Начните вводить город"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {results.map((item) => (
                <button
                  key={`${item.lat}-${item.lon}-${item.displayName}`}
                  type="button"
                  onClick={() => {
                    setSelectedCity(item);
                    setCityQuery(item.city);
                    setResults([]);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-amber-50 dark:hover:bg-zinc-800"
                >
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {item.city}
                    {item.country ? `, ${item.country}` : ""}
                  </span>
                  {item.displayName && (
                    <span className="block text-xs text-zinc-500">
                      {item.displayName}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <Select
          name="radiusKm"
          label="Радиус"
          defaultValue={first(params.radiusKm)}
          options={[
            ["", "Без радиуса"],
            ...radiusOptions.map(
              (radius): [string, string] => [String(radius), `${radius} км`],
            ),
          ]}
        />
        <Select
          name="language"
          label="Язык"
          defaultValue={first(params.language)}
          options={[
            ["", "Любой"],
            ...unionLanguageOptions.map(
              (language): [string, string] => [language.value, language.label],
            ),
          ]}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          {pending ? "Ищем город..." : "Применить фильтры"}
        </button>
        <a
          href="/union/recommendations"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Сбросить
        </a>
        <span className="text-xs text-zinc-400">
          Геопоиск: ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenStreetMap
          </a>{" "}
          contributors
        </span>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

