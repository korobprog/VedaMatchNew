"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AstroStateDto,
  AstroTimeAccuracy,
  GeoSearchResult,
} from "@vedamatch/shared";
import { AstroProgress } from "./astro-progress";
import { BirthTimeHelp } from "./birth-time-help";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Смещение в минутах → «UTC+5:30». Получасовые пояса встречаются чаще, чем кажется. */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return rest === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(rest).padStart(2, "0")}`;
}

export function BirthDataForm({ initial }: { initial: AstroStateDto }) {
  const router = useRouter();
  const saved = initial.birthData;

  const [birthDate, setBirthDate] = useState(
    saved?.birthDate ?? initial.suggestedBirthDate ?? "",
  );
  const [birthTime, setBirthTime] = useState(saved?.birthTime ?? "");
  const [timeUnknown, setTimeUnknown] = useState(
    saved?.timeAccuracy === "unknown",
  );
  const [placeQuery, setPlaceQuery] = useState(saved?.place.label ?? "");
  const [place, setPlace] = useState<GeoSearchResult | null>(
    saved
      ? {
          city: saved.place.label,
          lat: saved.place.latitude,
          lon: saved.place.longitude,
        }
      : null,
  );
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [timezone, setTimezone] = useState<string | null>(
    saved?.timezone ?? null,
  );
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = placeQuery.trim();
    if (query.length < 2 || query === place?.city) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query });
        const res = await apiFetch(`${API_URL}/geo/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        setResults((await res.json()) as GeoSearchResult[]);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") {
          return;
        }
        setResults([]);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [placeQuery, place]);

  /**
   * Пояс подтягивается сразу после выбора места, до сохранения: историческое
   * смещение человек должен увидеть и подтвердить, а не обнаружить в готовой карте.
   */
  async function selectPlace(candidate: GeoSearchResult) {
    setPlace(candidate);
    setPlaceQuery(candidate.displayName ?? candidate.city);
    setResults([]);
    try {
      const params = new URLSearchParams({
        lat: String(candidate.lat),
        lon: String(candidate.lon),
      });
      const res = await apiFetch(`${API_URL}/astro/birth-data/timezone?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      setTimezone(((await res.json()) as { timezone: string }).timezone);
    } catch {
      setTimezone(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!place) {
      setError("Выберите место рождения из подсказок.");
      return;
    }

    const timeAccuracy: AstroTimeAccuracy = timeUnknown ? "unknown" : "exact";
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/astro/birth-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timeAccuracy,
          place: {
            label: placeQuery.trim(),
            latitude: place.lat,
            longitude: place.lon,
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? "Не удалось сохранить данные");
      }
      setState((await res.json()) as AstroStateDto);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Не удалось сохранить",
      );
    } finally {
      setPending(false);
    }
  }

  const current = state.birthData;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="astro-date" className="block text-sm font-medium">
            Дата рождения
          </label>
          <input
            id="astro-date"
            type="date"
            required
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
          {initial.suggestedBirthDate && !saved && (
            <p className="mt-1.5 text-sm text-black/60 dark:text-white/60">
              Подставлена из вашего профиля.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="astro-place" className="block text-sm font-medium">
            Место рождения
          </label>
          <input
            id="astro-place"
            type="text"
            required
            autoComplete="off"
            placeholder="Город"
            value={placeQuery}
            onChange={(event) => {
              setPlaceQuery(event.target.value);
              setPlace(null);
              setTimezone(null);
            }}
            className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
          {results.length > 0 && (
            <ul className="mt-1.5 overflow-hidden rounded-lg border border-black/15 dark:border-white/20">
              {results.map((candidate) => (
                <li key={`${candidate.lat},${candidate.lon}`}>
                  <button
                    type="button"
                    onClick={() => void selectPlace(candidate)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {candidate.displayName ?? candidate.city}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {timezone && (
            <p className="mt-1.5 text-sm text-black/60 dark:text-white/60">
              Часовой пояс: {timezone}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="astro-time" className="block text-sm font-medium">
            Время рождения
          </label>
          <input
            id="astro-time"
            type="time"
            required={!timeUnknown}
            disabled={timeUnknown}
            value={birthTime}
            onChange={(event) => setBirthTime(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/15 px-3 py-2 disabled:opacity-50 dark:border-white/20 dark:bg-transparent"
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={timeUnknown}
              onChange={(event) => setTimeUnknown(event.target.checked)}
            />
            Время неизвестно
          </label>
        </div>

        <BirthTimeHelp />

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-500 px-5 py-2.5 font-medium text-black disabled:opacity-60"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>

        {current && (
          <div className="space-y-1.5 text-sm text-black/70 dark:text-white/70">
            <p>
              Момент рождения: {current.timezone},{" "}
              {formatUtcOffset(current.utcOffsetMinutes)}. Проверьте — в разные
              годы в одном городе смещение отличалось.
            </p>
            {current.nonexistentLocalTime && (
              <p className="text-amber-700 dark:text-amber-400">
                В этот день в вашем городе переводили стрелки, и указанного часа
                не существовало. Карта построена со сдвигом на час вперёд —
                уточните время, если можете.
              </p>
            )}
          </div>
        )}
      </form>

      <AstroProgress completeness={state.completeness} />
    </div>
  );
}
