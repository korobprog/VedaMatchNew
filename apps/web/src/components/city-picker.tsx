"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { GeoSearchResult, ProfileLocation } from "@vedamatch/shared";
import { apiFetch, readErrorMessage } from "@/lib/http-client";
import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Святые места вайшнавов одной кнопкой: их называет заметная часть портала, а
 * набирать их руками — ровно тот случай, где легко ошибиться в написании.
 */
const HOLY_PLACES = ["Маяпур", "Вриндаван", "Говардхан", "Джаганнатха-Пури"];

/**
 * Поиск города поверх `/geo/search`. Вынесен из профиля отдельным
 * компонентом: тот же выбор нужен мастеру онбординга, а размножать
 * клавиатурную логику комбобокса по формам — гарантия того, что где-то она
 * отстанет.
 *
 * Разметка следует паттерну combobox из WAI-ARIA: список — `listbox`,
 * варианты — `option`, а фокус остаётся в поле и ездит по вариантам через
 * `aria-activedescendant`. Без этого стрелки не работали, и с клавиатуры до
 * подсказок можно было добраться только табом сквозь весь список.
 */
export function CityPicker({
  value,
  onChange,
  onError,
  inputRef,
}: {
  value: ProfileLocation | null;
  onChange: (location: ProfileLocation | null) => void;
  onError?: (message: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const locale = useLocale();
  const ownRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? ownRef;
  const listId = useId();
  const inputId = useId();

  const [query, setQuery] = useState(value?.displayName ?? value?.city ?? "");
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [empty, setEmpty] = useState(false);
  // Отдельно от `empty`: отказ геокодера и честное «такого города нет» —
  // разные вещи, а под одной подписью человек читает их одинаково и правит
  // написание там, где править нечего.
  const [failure, setFailure] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  // -1 — «ничего не подсвечено»: список открыт, но Enter пока отправляет
  // не выбор, а ничего. Так стрелка вниз всегда начинает с первого варианта.
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === value?.displayName) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(
          `${API_URL}/geo/search?q=${encodeURIComponent(trimmed)}&lang=${locale}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error(
            await readErrorMessage(
              res,
              "Поиск городов сейчас недоступен, попробуйте через минуту",
            ),
          );
        }
        const found = (await res.json()) as GeoSearchResult[];
        setResults(found);
        setEmpty(found.length === 0);
        setFailure(null);
        setActiveIndex(-1);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResults([]);
        setEmpty(false);
        setFailure(
          e instanceof Error && e.message
            ? e.message
            : "Поиск городов сейчас недоступен, попробуйте через минуту",
        );
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [locale, query, value?.displayName]);

  function select(item: GeoSearchResult) {
    onChange(item);
    setQuery(item.displayName ?? item.city);
    setResults([]);
    setEmpty(false);
    setFailure(null);
    setActiveIndex(-1);
  }

  function close() {
    setResults([]);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter перехватываем всегда: в длинной форме профиля он иначе отправлял
    // её целиком, ещё не дождавшись подсказок.
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) select(results[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      close();
      return;
    }
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? results.length - 1 : index - 1,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    }
  }

  async function detect() {
    if (!navigator.geolocation) {
      onError?.("Браузер не поддерживает определение местоположения");
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await apiFetch(
            `${API_URL}/geo/reverse?lat=${latitude}&lon=${longitude}&lang=${locale}`,
          );
          if (!res.ok) throw new Error(await res.text());
          const location = (await res.json()) as GeoSearchResult;
          select(location);
        } catch (e) {
          onError?.(
            e instanceof Error ? e.message : "Не удалось определить город",
          );
        } finally {
          setDetecting(false);
        }
      },
      () => {
        setDetecting(false);
        onError?.("Разрешение на геолокацию не получено");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  const open = results.length > 0;

  return (
    <div>
      <div className="relative">
        <label className="mb-1 block text-xs text-text-2" htmlFor={inputId}>
          Поиск города
        </label>
        <input
          id={inputId}
          ref={field}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            // Ответ на прошлый запрос новому вводу не относится: и старые
            // варианты, и «ничего не нашлось», и сообщение об отказе
            // геокодера снимаются сразу.
            setEmpty(false);
            setFailure(null);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          placeholder="Начните вводить город"
          className={`${fieldClassName} py-3`}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Найденные города"
          // Атрибутом, а не классом: закрытый список обязан быть невидим и
          // для скринридера, а не только для глаза.
          hidden={!open}
          className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-glass-brd bg-bg-1 shadow-lg"
        >
          {results.map((item, index) => (
            <li
              key={`${item.lat}-${item.lon}-${item.displayName}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown, а не click: click приходит после blur, и список к
              // этому моменту уже мог закрыться.
              onMouseDown={(event) => {
                event.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-4 py-3 text-sm ${
                index === activeIndex ? "bg-glass" : ""
              }`}
            >
              <span className="block font-medium text-text-0">
                {item.city}
                {item.country ? `, ${item.country}` : ""}
              </span>
              {item.displayName && (
                <span className="block text-xs text-text-2">
                  {item.displayName}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Молчащее поле человек читает как поломку: перебор написаний может
          занять пару секунд, а пустой ответ без подсказки — тупик. */}
      <p className="mt-2 min-h-5 text-sm text-text-2" aria-live="polite">
        {searching && "Ищем города…"}
        {!searching && failure && (
          <span className="text-text-1">
            {failure} Город можно оставить пустым и заполнить позже.
          </span>
        )}
        {!searching && !failure && empty && (
          <span className="text-text-1">
            Ничего не нашлось. Попробуйте другое написание — например,
            латиницей: Mayapur, Vrindavan.
          </span>
        )}
        {!searching && open && (
          <span className="sr-only">
            Найдено вариантов: {results.length}. Выбирайте стрелками, Enter —
            подтвердить.
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-text-2">Часто выбирают:</span>
        {HOLY_PLACES.map((place) => (
          <button
            key={place}
            type="button"
            onClick={() => {
              setQuery(place);
              setResults([]);
              setEmpty(false);
              setFailure(null);
              setActiveIndex(-1);
              field.current?.focus();
            }}
            className="rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1 transition hover:text-text-0"
          >
            {place}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={detect} loading={detecting}>
          {detecting ? "Ищем..." : "Определить моё местоположение"}
        </Button>
        <Button
          variant="secondary"
          disabled={!value && query === ""}
          onClick={() => {
            onChange(null);
            setQuery("");
            setResults([]);
            setEmpty(false);
            setFailure(null);
            setActiveIndex(-1);
          }}
        >
          Очистить город
        </Button>
      </div>

      {value && <CityMap location={value} />}
    </div>
  );
}

function CityMap({ location }: { location: ProfileLocation }) {
  const [open, setOpen] = useState(false);
  const mapId = useId();

  const bbox = [
    location.lon - 0.08,
    location.lat - 0.04,
    location.lon + 0.08,
    location.lat + 0.04,
  ].join(",");
  const params = new URLSearchParams({
    bbox,
    layer: "mapnik",
    marker: `${location.lat},${location.lon}`,
  });

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-glass-brd">
      {/* Строка с названием отвечает на вопрос «тот ли город я выбрал» в
          девяти случаях из десяти, и она бесплатна. Карта нужна там, где
          названия мало: два Ростова, Маяпур против Маяпури. Поэтому она
          сложена, а не развёрнута.

          Свёрнута она вместе с `iframe`, а не спрятана классом: карту рисует
          openstreetmap.org, и незакрытая рамка отправляет туда обращение с
          координатами человека до того, как он о карте попросил. Заодно с
          шага онбординга уходят почти три сотни точек по высоте — там под
          картой пряталась кнопка «Дальше». */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-bg-1 p-3 text-sm text-text-1">
        <span>
          Выбран город: <span className="font-medium">{location.city}</span>
          {location.country ? `, ${location.country}` : ""}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={mapId}
          onClick={() => setOpen((was) => !was)}
          className="shrink-0 rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1 transition hover:text-text-0"
        >
          {open ? "Скрыть карту" : "Показать на карте"}
        </button>
      </div>
      {open && (
        <iframe
          id={mapId}
          title="Карта города проживания"
          src={`https://www.openstreetmap.org/export/embed.html?${params}`}
          className="h-56 w-full border-0 sm:h-72"
          loading="lazy"
        />
      )}
    </div>
  );
}
