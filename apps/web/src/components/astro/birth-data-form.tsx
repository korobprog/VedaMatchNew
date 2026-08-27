"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AstroStateDto,
  AstroTimeAccuracy,
  GeoSearchResult,
} from "@vedamatch/shared";
import { AstroProgress } from "./astro-progress";
import {
  LEAP_FALLBACK_YEAR,
  MONTH_NAMES,
  birthDateProblem,
  daysInMonth,
  withPart,
  toIso,
  toParts,
  yearOptions,
  type BirthDateParts,
} from "./birth-date";
import { BirthTimeHelp } from "./birth-time-help";
import { formatUtcOffset } from "./utc-offset";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Общий вид поля. Токены темы, а не чёрное с белым: захардкоженные цвета
 * переживают переключение темы и остаются от чужой — см. CLAUDE.md.
 */
const FIELD =
  "mt-1.5 min-h-[2.5rem] w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-text-0 transition focus:border-mint-edge";

export function BirthDataForm({ initial }: { initial: AstroStateDto }) {
  const router = useRouter();
  const saved = initial.birthData;

  const [dateParts, setDateParts] = useState<BirthDateParts>(() =>
    toParts(saved?.birthDate ?? initial.suggestedBirthDate),
  );
  const birthDate = toIso(dateParts) ?? "";
  const years = yearOptions(new Date());
  const todayIso = new Date().toISOString().slice(0, 10);
  /** Нижняя граница нативного барабана — тот же разумный возраст, что в списке лет. */
  const minIso = `${years[years.length - 1]}-01-01`;
  /**
   * Список дней укорачивается под выбранный месяц: 31 февраля выбрать нельзя,
   * если его там просто нет. Без года февраль показываем високосным — 29-е
   * существует чаще, чем нет.
   */
  const maxDay = daysInMonth(
    Number(dateParts.year) || LEAP_FALLBACK_YEAR,
    Number(dateParts.month) || 1,
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

    const dateProblem = birthDateProblem(dateParts, new Date());
    if (dateProblem) {
      setError(dateProblem);
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
        {/*
          Дата вводится по-разному на телефоне и на десктопе — потому что
          удобное там разное.

          На десктопе `input[type=date]` открывает календарь на текущем годе,
          и до года рождения его крутят десятилетиями; три списка выбирают
          год одним движением.

          На телефоне наоборот: там `input[type=date]` — это системный
          барабан (на iOS сразу трёхколоночный), и он привычнее и удобнее
          трёх отдельных колёс.

          Обе раскладки — родные элементы: клавиатура, скринридер и
          подстановка работают без единой строки ARIA. Показана всегда ровно
          одна, вторая скрыта `display:none` и в дерево доступности не
          попадает, так что метка не задваивается.
        */}
        <fieldset>
          <legend className="text-sm font-medium text-text-0">
            Дата рождения
          </legend>
          {/*
            На телефоне — нативный `input[type=date]`: iOS открывает по нему
            трёхколоночный барабан, а Android — свой календарь. Это и есть
            привычный там способ ввести дату, и системный он всегда удобнее
            нарисованного нами.

            `required` здесь нет намеренно ни у одного поля: спрятанное
            `display:none` поле с `required` роняет отправку формы ошибкой
            «invalid form control is not focusable». Дату проверяет
            birthDateProblem при отправке — одинаково для обеих раскладок.
          */}
          <input
            type="date"
            aria-label="Дата рождения"
            value={birthDate}
            max={todayIso}
            min={minIso}
            onChange={(event) => setDateParts(toParts(event.target.value))}
            className={`${FIELD} md:hidden`}
          />

          <div className="mt-1.5 hidden grid-cols-[5rem_1fr_6rem] gap-2 md:grid">
            <span>
              <label htmlFor="astro-day" className="sr-only">
                День рождения
              </label>
              <select
                id="astro-day"
                value={dateParts.day}
                onChange={(event) =>
                  setDateParts((parts) => withPart(parts, "day", event.target.value))
                }
                className={FIELD}
              >
                <option value="">День</option>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={String(day).padStart(2, "0")}>
                    {day}
                  </option>
                ))}
              </select>
            </span>

            <span>
              <label htmlFor="astro-month" className="sr-only">
                Месяц рождения
              </label>
              <select
                id="astro-month"
                value={dateParts.month}
                onChange={(event) =>
                  setDateParts((parts) =>
                    withPart(parts, "month", event.target.value),
                  )
                }
                className={FIELD}
              >
                <option value="">Месяц</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={String(index + 1).padStart(2, "0")}>
                    {name}
                  </option>
                ))}
              </select>
            </span>

            <span>
              <label htmlFor="astro-year" className="sr-only">
                Год рождения
              </label>
              <select
                id="astro-year"
                value={dateParts.year}
                onChange={(event) =>
                  setDateParts((parts) => withPart(parts, "year", event.target.value))
                }
                className={FIELD}
              >
                <option value="">Год</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </span>
          </div>

          {/* Собранная дата словами: «7 марта 1985» ошибку видно сразу, а в
              трёх списках порознь — нет. */}
          {birthDate && (
            <p className="mt-1.5 text-sm text-text-2">
              {Number(dateParts.day)} {MONTH_NAMES[Number(dateParts.month) - 1]}{" "}
              {dateParts.year} года
            </p>
          )}
          {initial.suggestedBirthDate && !saved && (
            <p className="mt-1.5 text-sm text-text-2">
              Подставлена из вашего профиля.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="astro-place" className="block text-sm font-medium text-text-0">
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
            className={FIELD}
          />
          {results.length > 0 && (
            <ul className="mt-1.5 overflow-hidden rounded-lg border border-glass-brd bg-bg-1">
              {results.map((candidate) => (
                <li key={`${candidate.lat},${candidate.lon}`}>
                  <button
                    type="button"
                    onClick={() => void selectPlace(candidate)}
                    className="block w-full px-3 py-2 text-left text-sm text-text-1 transition hover:bg-glass hover:text-text-0"
                  >
                    {candidate.displayName ?? candidate.city}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {timezone && (
            <p className="mt-1.5 text-sm text-text-2">Часовой пояс: {timezone}</p>
          )}
        </div>

        <div>
          <label htmlFor="astro-time" className="block text-sm font-medium text-text-0">
            Время рождения
          </label>
          <input
            id="astro-time"
            type="time"
            required={!timeUnknown}
            disabled={timeUnknown}
            value={birthTime}
            onChange={(event) => setBirthTime(event.target.value)}
            className={`${FIELD} disabled:opacity-50`}
          />
          <label className="mt-2 flex min-h-[24px] items-center gap-2 text-sm text-text-1">
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
          <p role="alert" className="text-sm font-medium text-magenta">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-mint rounded-lg px-5 py-2.5 font-medium disabled:opacity-60"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>

        {current && (
          <div className="space-y-1.5 text-sm text-text-1">
            <p>
              Момент рождения: {current.timezone},{" "}
              {formatUtcOffset(current.utcOffsetMinutes)}. Проверьте — в разные
              годы в одном городе смещение отличалось.
            </p>
            {current.nonexistentLocalTime && (
              <p className="text-gold">
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
