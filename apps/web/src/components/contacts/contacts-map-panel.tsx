"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ContactsMapPoint,
  ContactsMapResponse,
  ContactsSearchFilters,
} from "@vedamatch/shared";
import { getContactsMapPoints } from "@/lib/contacts-api";
import { ContactsMap, type ContactsMapArea } from "./contacts-map";

/**
 * Блок «Поиск на карте» над фильтрами.
 *
 * Карта закрыта по умолчанию и не грузится, пока её не открыли: Leaflet и
 * плитки OSM не должны стоить трафика тем, кто ищет по тегам.
 *
 * Точки берутся по тем же фильтрам, что и выдача, — карта и список всегда
 * показывают одних и тех же людей.
 */
export function ContactsMapPanel({
  filters,
  onApply,
}: {
  filters: ContactsSearchFilters;
  onApply: (filters: ContactsSearchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Результат помнит запрос, на который пришёл, — как и в выдаче поиска.
   * Так не нужен ни отдельный флаг загрузки, ни сброс ошибки в теле эффекта
   * (синхронный setState там вызывает каскад рендеров), а старые точки не
   * могут остаться на карте под уже изменившимися фильтрами.
   */
  const [result, setResult] = useState<{
    query: string;
    response?: ContactsMapResponse;
    error?: string;
  } | null>(null);

  const query = buildMapKey(filters);
  const current = result?.query === query ? result : null;
  const data = current?.response ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let alive = true;

    getContactsMapPoints(filters, controller.signal)
      .then((response) => {
        if (alive) setResult({ query, response });
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        // Радиус без координат бэкенд объясняет своим текстом — он точнее.
        setResult({
          query,
          error:
            e instanceof Error ? e.message : "Не удалось загрузить карту",
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // filters — новый объект на каждый рендер родителя; сравниваем по строке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  const selectCity = useCallback(
    (point: ContactsMapPoint) => {
      // Щелчок по городу — это фильтр по городу, а не по радиусу: радиус
      // вокруг центра города прихватил бы соседние населённые пункты.
      onApply({
        ...filters,
        city: point.city,
        country: point.country ?? undefined,
        radiusKm: undefined,
        lat: undefined,
        lon: undefined,
      });
    },
    [filters, onApply],
  );

  const searchArea = useCallback(
    (area: ContactsMapArea) => {
      // Область перекрывает город и страну: искать надо там, куда увели карту.
      onApply({
        ...filters,
        city: undefined,
        country: undefined,
        lat: area.lat,
        lon: area.lon,
        radiusKm: area.radiusKm,
      });
    },
    [filters, onApply],
  );

  const total = (data?.points ?? []).reduce(
    (sum, point) => sum + point.count,
    0,
  );

  return (
    <section className="glass mb-4 rounded-3xl border border-glass-brd p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="rounded-xl border border-glass-brd bg-bg-1 px-4 py-2 text-sm font-semibold text-text-0 transition hover:border-magenta/50"
        >
          {open ? "Скрыть карту" : "Поиск на карте"}
        </button>
        {open && data && (
          <span className="text-sm text-text-2">
            {data.points.length === 0
              ? "По этим условиям городов на карте нет."
              : `Городов: ${data.points.length}, человек: ${total}.`}
            {data.withoutLocation > 0 &&
              ` Ещё ${data.withoutLocation} без города на карте.`}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-4">
          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-glass-brd p-4 text-sm text-magenta"
            >
              {error}
            </p>
          ) : data === null ? (
            <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
              Загружаем карту…
            </p>
          ) : (
            <ContactsMap
              points={data.points}
              onSelectCity={selectCity}
              onAreaChange={searchArea}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Ключ перезагрузки точек. Страница и её размер в него не входят: карта
 * показывает все совпадения сразу, и листание выдачи её не меняет.
 */
function buildMapKey(filters: ContactsSearchFilters): string {
  return JSON.stringify({ ...filters, page: undefined, pageSize: undefined });
}
