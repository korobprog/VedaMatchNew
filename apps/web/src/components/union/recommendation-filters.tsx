"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  GeoSearchResult,
  SpiritualStage,
  UnionFormat,
} from "@vedamatch/shared";
import {
  unionChildrenStatusLabels,
  unionDietLabels,
  unionLanguageOptions,
} from "./dictionaries";
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

// Совпадает с MIN_PROFILE_AGE / MAX_PROFILE_AGE на стороне API.
const MIN_AGE = 18;
const MAX_AGE = 120;

const DESKTOP_QUERY = "(min-width: 1024px)";

const desktopQuery = () => window.matchMedia(DESKTOP_QUERY);

function subscribeToDesktopQuery(onChange: () => void): () => void {
  const query = desktopQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 outline-none transition focus:border-magenta/50";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-text-2";

export function RecommendationFilters({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const initialCity = first(params.city) ?? "";
  const initialCountry = first(params.country) ?? "";
  const [cityQuery, setCityQuery] = useState(initialCity);
  const [countryQuery, setCountryQuery] = useState(initialCountry);
  const [selectedCity, setSelectedCity] = useState<GeoSearchResult | null>(
    initialCity
      ? {
          city: initialCity,
          country: initialCountry || undefined,
          lat: Number(first(params.lat) ?? NaN),
          lon: Number(first(params.lon) ?? NaN),
        }
      : null,
  );
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [pending, setPending] = useState(false);
  const [resettingHistory, setResettingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // На узких экранах панель фильтров занимала бы весь первый экран, поэтому по
  // умолчанию она раскрыта только на десктопе; клик пользователя это перекрывает.
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopQuery,
    () => desktopQuery().matches,
    () => true,
  );
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? isDesktop;
  const activeFilterCount = countActiveFilters(params);

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || query === selectedCity?.city) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPending(true);
      try {
        const searchParams = new URLSearchParams({ q: query });
        const country = countryQuery.trim();
        if (country) searchParams.set("country", country);
        const res = await fetch(
          `${API_URL}/geo/search?${searchParams.toString()}`,
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
  }, [cityQuery, countryQuery, selectedCity?.city]);

  /**
   * Отдельно от «Сбросить»: та кнопка только чистит фильтры, а уже
   * отсмотренные анкеты (лайк/пропуск) не показываются повторно независимо
   * от фильтров — это своя история, и её нужно сбрасывать явно.
   */
  async function handleResetHistory() {
    setHistoryError(null);
    setResettingHistory(true);
    try {
      const res = await fetch(`${API_URL}/union/swipes/history`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const { restoredCount } = (await res.json()) as { restoredCount: number };
      // Показываем результат явно: без этого «0 анкет» неотличимо от сломанной
      // кнопки — пользователь видит тот же пустой список и решает, что ничего
      // не произошло.
      const query = new URLSearchParams(window.location.search);
      query.set("historyReset", String(restoredCount));
      window.location.href = `${window.location.pathname}?${query.toString()}`;
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Не удалось сбросить историю показов",
      );
      setResettingHistory(false);
    }
  }

  return (
    <form
      action="/union/recommendations"
      className="glass mb-6 rounded-3xl border border-glass-brd p-4 sm:p-5"
    >
      <input type="hidden" name="page" value="1" />
      {/* Подборка задаёт порядок и порог совместимости — форма их не теряет. */}
      {first(params.sort) && (
        <input type="hidden" name="sort" value={first(params.sort)} />
      )}
      {first(params.minScore) && (
        <input type="hidden" name="minScore" value={first(params.minScore)} />
      )}
      {Number.isFinite(selectedCity?.lat) && (
        <input type="hidden" name="lat" value={String(selectedCity?.lat)} />
      )}
      {Number.isFinite(selectedCity?.lon) && (
        <input type="hidden" name="lon" value={String(selectedCity?.lon)} />
      )}

      <button
        type="button"
        onClick={() => setExpandedOverride(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between text-sm font-semibold text-text-0 lg:hidden"
      >
        Фильтры
        {activeFilterCount > 0 && (
          <span className="ml-2 mr-auto rounded-full bg-magenta px-2 py-0.5 text-xs font-semibold text-white">
            {activeFilterCount}
          </span>
        )}
        <span aria-hidden="true" className="text-text-2">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      <div className={expanded ? "mt-3 lg:mt-0" : "hidden lg:block"}>
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
          name="gender"
          label="Пол"
          defaultValue={first(params.gender)}
          options={[
            ["", "Любой"],
            ["male", "Мужской"],
            ["female", "Женский"],
          ]}
        />
        <Select
          name="format"
          label="Формат"
          defaultValue={first(params.format)}
          options={[
            ["", "Любой"],
            ["online", formatLabels.online],
            ["offline", formatLabels.offline],
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[0.8fr_1.2fr_180px_1fr]">
        <label className="block">
          <span className={labelClass}>Страна</span>
          <input
            name="country"
            type="text"
            value={countryQuery}
            onChange={(event) => {
              setCountryQuery(event.target.value);
              setSelectedCity(null);
              setResults([]);
            }}
            placeholder="Например, Россия"
            className={fieldClass}
          />
        </label>
        <div className="relative">
          <label htmlFor="recommendation-city" className={labelClass}>
            Город
          </label>
          <input
            id="recommendation-city"
            name="city"
            type="text"
            value={cityQuery}
            onChange={(event) => {
              setCityQuery(event.target.value);
              setSelectedCity(null);
              setResults([]);
            }}
            placeholder="Начните вводить город"
            className={fieldClass}
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-glass-brd bg-bg-1 shadow-lg">
              {results.map((item) => (
                <button
                  key={`${item.lat}-${item.lon}-${item.displayName}`}
                  type="button"
                  onClick={() => {
                    setSelectedCity(item);
                    setCityQuery(item.city);
                    setCountryQuery(item.country ?? "");
                    setResults([]);
                  }}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-bg-2"
                >
                  <span className="block font-medium text-text-0">
                    {item.city}
                    {item.country ? `, ${item.country}` : ""}
                  </span>
                  {locationDetails(item) && (
                    <span className="block text-xs text-text-2">
                      {locationDetails(item)}
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

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Select
          name="diet"
          label="Питание"
          defaultValue={first(params.diet)}
          options={[
            ["", "Любое"],
            ...(Object.entries(unionDietLabels) as Array<[string, string]>),
          ]}
        />
        <Select
          name="principlesMin"
          label="Регулирующие принципы"
          defaultValue={first(params.principlesMin)}
          options={[
            ["", "Неважно"],
            ["1", "хотя бы 1"],
            ["2", "хотя бы 2"],
            ["3", "хотя бы 3"],
            ["4", "все 4"],
          ]}
        />
        <Select
          name="childrenStatus"
          label="Дети"
          defaultValue={first(params.childrenStatus)}
          options={[
            ["", "Неважно"],
            ...(Object.entries(unionChildrenStatusLabels) as Array<
              [string, string]
            >),
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:max-w-md">
        <label className="block">
          <span className={labelClass}>Возраст от</span>
          <input
            name="ageMin"
            type="number"
            min={MIN_AGE}
            max={MAX_AGE}
            inputMode="numeric"
            defaultValue={first(params.ageMin) ?? ""}
            placeholder={String(MIN_AGE)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Возраст до</span>
          <input
            name="ageMax"
            type="number"
            min={MIN_AGE}
            max={MAX_AGE}
            inputMode="numeric"
            defaultValue={first(params.ageMax) ?? ""}
            placeholder="без ограничения"
            className={fieldClass}
          />
        </label>
      </div>

      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
        <input
          type="checkbox"
          name="verifiedOnly"
          value="true"
          defaultChecked={first(params.verifiedOnly) === "true"}
          className="h-4 w-4 accent-cyan"
        />
       Подтверждённые администрацией
      </label>

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
        <input
          type="checkbox"
          name="photoVerifiedOnly"
          value="true"
          defaultChecked={first(params.photoVerifiedOnly) === "true"}
          className="h-4 w-4 accent-gold"
        />
        Только профили с проверенными фото
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)]"
        >
          {pending ? "Ищем город..." : "Применить фильтры"}
        </button>
        <a
          href="/union/recommendations"
          className="text-sm font-medium text-text-2 transition hover:text-text-0"
        >
          Сбросить
        </a>
        <button
          type="button"
          onClick={handleResetHistory}
          disabled={resettingHistory}
          title="Уже отсмотренные вами анкеты вернутся в колоду. Состоявшиеся знакомства не затрагиваются."
          className="text-sm font-medium text-text-2 transition hover:text-text-0 disabled:opacity-50"
        >
          {resettingHistory ? "Показываем заново…" : "Показать всех заново"}
        </button>
        <span className="text-xs text-text-2">
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
      {historyError && (
        <p className="mt-2 text-xs text-rose-400">{historyError}</p>
      )}
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
      <span className={labelClass}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className={fieldClass}
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

const filterKeys = [
  "intention",
  "stage",
  "gender",
  "format",
  "country",
  "city",
  "radiusKm",
  "language",
  "ageMin",
  "ageMax",
  "diet",
  "principlesMin",
  "childrenStatus",
  "verifiedOnly",
  "photoVerifiedOnly",
] as const;

function countActiveFilters(
  params: Record<string, string | string[] | undefined>,
): number {
  return filterKeys.filter((key) => Boolean(first(params[key]))).length;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function locationDetails(item: GeoSearchResult): string {
  const excluded = new Set(
    [item.city, item.country]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()),
  );
  const seen = new Set<string>();

  return (item.displayName ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const normalized = part.toLocaleLowerCase();
      if (!part || excluded.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(", ");
}

