"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  GeoSearchResult,
  SpiritualStage,
  UnionFormat,
  UnionIntentionCounts,
  UnionIntentionType,
} from "@vedamatch/shared";
import {
  unionChildrenStatusLabels,
  unionDietLabels,
  unionLanguageOptions,
} from "./dictionaries";
import { IntentionChips } from "./intention-chips";
import { intentionTypes } from "./labels";
import { apiFetch } from "@/lib/http-client";

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

// Ключ хранит только возрастной фильтр — остальные фильтры живут в URL и
// сами переживают навигацию через defaultValue из searchParams.
const AGE_STORAGE_KEY = "union.recommendations.ageRange";

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
  intentionCounts,
}: {
  params: Record<string, string | string[] | undefined>;
  intentionCounts?: UnionIntentionCounts;
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
        const res = await apiFetch(
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
    const confirmed = window.confirm(
      "Все пропуски и ещё не отвеченные заявки будут отменены. Состоявшиеся знакомства не затрагиваются. Отменить это действие нельзя.",
    );
    if (!confirmed) return;
    setHistoryError(null);
    setResettingHistory(true);
    try {
      const res = await apiFetch(`${API_URL}/union/swipes/history`, {
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
      {intentionCounts && (
        <IntentionChips
          counts={intentionCounts}
          selected={selectedIntentions(params)}
        />
      )}
      <div className="grid gap-3 md:grid-cols-3">
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

      <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_180px_1fr]">
        {/* Страна больше не редактируется вручную — подставляется из выбранного
            города и уходит на сервер как есть, чтобы бэкенд-фильтр по стране
            (внутри условия `filters.city`, см. union-profile.service.ts) не
            терял точность без лишнего поля в UI. */}
        <input type="hidden" name="country" value={countryQuery} />
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
              // Страна больше не редактируется вручную: без сброса тут
              // подставленное ранее значение молча продолжило бы сужать
              // поиск, даже когда пользователь печатает совсем другой город.
              setCountryQuery("");
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

      <AgeRangeFilter
        initialMin={first(params.ageMin) ?? ""}
        initialMax={first(params.ageMax) ?? ""}
      />

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

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
        <input
          type="checkbox"
          name="includeSwiped"
          value="true"
          defaultChecked={first(params.includeSwiped) === "true"}
          className="h-4 w-4 accent-magenta"
        />
        Показывать уже отсмотренных
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
          onClick={() => {
            // Иначе сохранённый возрастной фильтр молча вернётся при следующем
            // заходе на пустой URL и «Сбросить» не будет ощущаться сброшенным.
            try {
              window.localStorage.removeItem(AGE_STORAGE_KEY);
            } catch {
              // localStorage недоступен (приватный режим и т.п.) — не критично.
            }
          }}
          className="text-sm font-medium text-text-2 transition hover:text-text-0"
        >
          Сбросить
        </a>
        <button
          type="button"
          onClick={handleResetHistory}
          disabled={resettingHistory}
          title="Все пропуски и ещё не отвеченные заявки будут отменены. Состоявшиеся знакомства не затрагиваются. Отменить это действие нельзя."
          className="text-sm font-medium text-text-2 transition hover:text-text-0 disabled:opacity-50"
        >
          {resettingHistory ? "Стираем…" : "Стереть решения и заявки"}
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

/**
 * Диапазон возраста кандидатов. Placeholder «От»/«До» вместо примерных
 * чисел — иначе плейсхолдер выглядит как уже введённое значение. Выбор
 * запоминается в localStorage: человек, вернувшийся на пустой URL (клик по
 * «Знакомства» в навигации), видит тот же диапазон, что задавал раньше, а
 * не значения по умолчанию заново.
 */
function AgeRangeFilter({
  initialMin,
  initialMax,
}: {
  initialMin: string;
  initialMax: string;
}) {
  const [ageMin, setAgeMin] = useState(initialMin);
  const [ageMax, setAgeMax] = useState(initialMax);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Восстановление из localStorage возможно только после маунта (на
    // сервере его нет) — синхронного способа получить те же данные к
    // первому рендеру не существует, это тот случай, ради которого нужен
    // эффект. Тот же приём для темы см. в ThemeProvider.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!initialMin && !initialMax) {
      try {
        const saved = window.localStorage.getItem(AGE_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { min?: string; max?: string };
          if (parsed.min) setAgeMin(parsed.min);
          if (parsed.max) setAgeMax(parsed.max);
        }
      } catch {
        // Битые данные в localStorage — просто остаёмся с пустыми полями.
      }
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Восстанавливаем один раз на маунт: дальше запись однонаправленная,
    // от полей в localStorage, а не наоборот.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (!ageMin && !ageMax) {
        window.localStorage.removeItem(AGE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          AGE_STORAGE_KEY,
          JSON.stringify({ min: ageMin, max: ageMax }),
        );
      }
    } catch {
      // Приватный режим и т.п. — фильтр всё равно работает в рамках сессии.
    }
  }, [ageMin, ageMax, hydrated]);

  const active = Boolean(ageMin || ageMax);

  return (
    <div
      className={`mt-3 rounded-xl border p-3 transition md:max-w-md ${
        active
          ? "border-magenta/50 bg-magenta/5"
          : "border-transparent"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={labelClass}>Возраст партнёра</span>
        <div className="flex items-center gap-2">
          {active && (
            <span className="rounded-full bg-magenta px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Применён
            </span>
          )}
          {active && (
            <button
              type="button"
              onClick={() => {
                setAgeMin("");
                setAgeMax("");
              }}
              className="text-xs font-medium text-text-2 transition hover:text-text-0"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="ageMin"
          type="number"
          min={MIN_AGE}
          max={MAX_AGE}
          inputMode="numeric"
          value={ageMin}
          onChange={(event) => setAgeMin(event.target.value)}
          placeholder="От"
          aria-label="Возраст от"
          className={fieldClass}
        />
        <input
          name="ageMax"
          type="number"
          min={MIN_AGE}
          max={MAX_AGE}
          inputMode="numeric"
          value={ageMax}
          onChange={(event) => setAgeMax(event.target.value)}
          placeholder="До"
          aria-label="Возраст до"
          className={fieldClass}
        />
      </div>
    </div>
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
  "intentions",
  // Старая ссылка с `intention=` тоже должна зажигать бейдж на мобильном.
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
  "includeSwiped",
] as const;

function countActiveFilters(
  params: Record<string, string | string[] | undefined>,
): number {
  return filterKeys.filter((key) => Boolean(first(params[key]))).length;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Старая ссылка с `intention=` продолжает открываться выбранным чипом. */
function selectedIntentions(
  params: Record<string, string | string[] | undefined>,
): UnionIntentionType[] {
  const raw = params.intentions ?? params.intention;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return intentionTypes.filter((type) => list.includes(type));
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

