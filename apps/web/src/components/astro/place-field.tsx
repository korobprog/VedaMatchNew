"use client";

import { useEffect, useState } from "react";
import type { GeoSearchResult } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { ASTRO_FIELD } from "./birth-date-field";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Поле места рождения с подсказками по справочнику.
 *
 * Место выбирается ТОЛЬКО из подсказок: по названию, набранному руками, нет
 * координат, а без них карту не построить. Поэтому выбор подсказки — не
 * удобство, а условие, и родитель узнаёт о нём отдельным колбэком.
 */
export function PlaceField({
  id,
  query,
  onQueryChange,
  onPick,
}: {
  id: string;
  query: string;
  /** Набранный текст: сбрасывает ранее выбранное место у родителя. */
  onQueryChange: (value: string) => void;
  onPick: (place: GeoSearchResult) => void;
}) {
  const [results, setResults] = useState<GeoSearchResult[]>([]);

  useEffect(() => {
    const needle = query.trim();
    // Короткий запрос просто не ищем. Гасить список здесь нельзя — это
    // setState прямо в теле эффекта; вместо этого он не рисуется ниже.
    if (needle.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: needle });
        const res = await apiFetch(`${API_URL}/geo/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        setResults((await res.json()) as GeoSearchResult[]);
      } catch (cause) {
        // Отменённый запрос — не ошибка: человек просто продолжил печатать.
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setResults([]);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <>
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder="Город"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className={ASTRO_FIELD}
      />
      {query.trim().length >= 2 && results.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-lg border border-glass-brd bg-bg-1">
          {results.map((candidate) => (
            <li key={`${candidate.lat},${candidate.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(candidate);
                  setResults([]);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text-1 transition hover:bg-glass hover:text-text-0"
              >
                {candidate.displayName ?? candidate.city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
