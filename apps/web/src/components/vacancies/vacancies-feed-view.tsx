"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type {
  GeoSearchResult,
  VacancyKind,
  VacancyOfferDto,
} from "@vedamatch/shared";
import { VacanciesApiError, getVacanciesFeed } from "@/lib/vacancies-api";
import { apiFetch } from "@/lib/http-client";
import { VacancyCard } from "./vacancy-card";
import { VACANCY_KIND_CHIPS, VACANCY_KIND_ORDER } from "./vacancy-labels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FILTERS_KEY = "vacancies:feed-filters";

interface StoredFilters {
  kind: VacancyKind | null;
  city: string;
  remote: boolean;
  communityOnly: boolean;
}

function readStoredFilters(): StoredFilters | null {
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as StoredFilters) : null;
  } catch {
    return null;
  }
}

/** Лента предложений: вид сегментами, город или удалённо, только от общин. */
export function VacanciesFeedView({ mine = false }: { mine?: boolean }) {
  const [items, setItems] = useState<VacancyOfferDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<VacancyKind | null>(null);
  // Фильтр по городу в API сравнивает точным совпадением, поэтому в него
  // годится только город, подтверждённый геокодером. `cityQuery` — что видно
  // в поле, `city` — что реально фильтрует.
  const [cityQuery, setCityQuery] = useState("");
  const [city, setCity] = useState("");
  const [cityResults, setCityResults] = useState<GeoSearchResult[]>([]);
  const [remote, setRemote] = useState(false);
  const [communityOnly, setCommunityOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Сохранённые фильтры — удобство, а не состояние: если localStorage
  // недоступен, лента просто откроется без них.
  // Чтение localStorage — внешняя система; состояние обновляется из
  // колбэка, а не из тела эффекта, как требует правило хуков.
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      const stored = mine ? null : readStoredFilters();
      if (stored) {
        setKind(stored.kind);
        setCity(stored.city);
        setCityQuery(stored.city);
        setRemote(stored.remote);
        setCommunityOnly(stored.communityOnly);
      }
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [mine]);

  useEffect(() => {
    if (!restored || mine) return;
    try {
      window.localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({ kind, city, remote, communityOnly } satisfies StoredFilters),
      );
    } catch {
      // Приватное окно или запрет на хранение — фильтры просто не запомнятся.
    }
  }, [restored, mine, kind, city, remote, communityOnly]);

  useEffect(() => {
    const trimmed = cityQuery.trim();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (trimmed.length < 2 || trimmed === city) {
        setCityResults([]);
        return;
      }
      apiFetch(`${API_URL}/geo/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          setCityResults((await res.json()) as GeoSearchResult[]);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setCityResults([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cityQuery, city]);

  useEffect(() => {
    if (!restored) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      getVacanciesFeed(
        {
          mine,
          kind: kind ?? undefined,
          city: city || undefined,
          remote: remote || undefined,
          communityOnly: communityOnly || undefined,
          q: query || undefined,
        },
        controller.signal,
      )
        .then((response) => {
          setItems(response.items);
          setNextCursor(response.nextCursor);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(
            e instanceof VacanciesApiError
              ? e.message
              : "Не удалось загрузить ленту",
          );
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [restored, mine, kind, city, remote, communityOnly, query]);

  // Поколение ленты: ответ на «показать ещё», пришедший после смены фильтра,
  // приклеил бы старые карточки к новой ленте — такие ответы отбрасываем.
  const feedGeneration = useRef(0);
  useEffect(() => {
    feedGeneration.current += 1;
  }, [mine, kind, city, remote, communityOnly, query]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const generation = feedGeneration.current;
    setLoadingMore(true);
    try {
      const response = await getVacanciesFeed({
        mine,
        kind: kind ?? undefined,
        city: city || undefined,
        remote: remote || undefined,
        communityOnly: communityOnly || undefined,
        q: query || undefined,
        cursor: nextCursor,
      });
      if (generation !== feedGeneration.current) return;
      setItems((current) => [...current, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (e) {
      if (generation !== feedGeneration.current) return;
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, mine, kind, city, remote, communityOnly, query]);

  return (
    <div>
      <div className="glass mb-6 space-y-3 rounded-2xl border border-glass-brd p-4">
        <div role="radiogroup" aria-label="Вид предложения" className="flex flex-wrap gap-2">
          <KindChip
            label="Все"
            checked={kind === null}
            onSelect={() => setKind(null)}
          />
          {VACANCY_KIND_ORDER.map((option) => (
            <KindChip
              key={option}
              label={VACANCY_KIND_CHIPS[option]}
              checked={kind === option}
              onSelect={() => setKind(option)}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Что ищете"
            aria-label="Поиск по предложениям"
            className="rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
          <div className="relative">
            <input
              type="search"
              value={cityQuery}
              disabled={remote}
              onChange={(event) => {
                setCityQuery(event.target.value);
                // Пока не выбрали подсказку, фильтр по городу снят: точный
                // поиск на «Хабаро» отдал бы пустую ленту.
                setCity("");
              }}
              placeholder="Город"
              aria-label="Город"
              className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2 disabled:opacity-50"
            />
            {cityResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-glass-brd bg-bg-1 shadow-lg">
                {cityResults.map((result) => (
                  <li key={`${result.lat},${result.lon}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCity(result.city);
                        setCityQuery(result.city);
                        setCityResults([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-text-1 hover:bg-bg-2 hover:text-text-0"
                    >
                      {result.displayName ?? result.city}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-text-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remote}
              onChange={(event) => setRemote(event.target.checked)}
            />
            Удалённо или из любого города
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={communityOnly}
              onChange={(event) => setCommunityOnly(event.target.checked)}
            />
            Только от общин
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {mine ? (
            <p>
              Вы пока ничего не размещали.{" "}
              <Link href="/vacancies/new" className="text-text-0 underline">
                Разместить предложение
              </Link>
            </p>
          ) : (
            <p>
              По этим фильтрам пусто. Снимите часть из них или{" "}
              <Link href="/vacancies/new" className="text-text-0 underline">
                разместите своё
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((offer) => (
              <li key={offer.id}>
                <VacancyCard offer={offer} />
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mt-6 w-full rounded-xl border border-glass-brd px-4 py-3 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
            >
              {loadingMore ? "Загружаем…" : "Показать ещё"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Сегмент вида: radio, а не кнопка с aria-pressed, — выбор один из N. */
function KindChip({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        checked
          ? "border-magenta/40 bg-magenta/10 text-text-0"
          : "border-glass-brd text-text-1 hover:text-text-0"
      }`}
    >
      {label}
    </button>
  );
}
