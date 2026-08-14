"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ContactsMapPoint } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/** Вся Россия и соседи в кадре — карта открывается «где все», а не в океане. */
const DEFAULT_CENTER: [number, number] = [55.75, 60];
const DEFAULT_ZOOM = 3;
/** Зум, на который карта наводится по щелчку в метку города. */
const CITY_ZOOM = 9;

export interface ContactsMapArea {
  lat: number;
  lon: number;
  /** Радиус видимой области в километрах, округлённый вверх до целого. */
  radiusKm: number;
}

/**
 * Карта справочника: метки городов, а не людей.
 *
 * Leaflet грузится динамическим `import()` внутри эффекта. Он трогает
 * `window` прямо при вычислении модуля, поэтому на сервере его быть не должно
 * — статический импорт уронил бы серверный рендер страницы.
 *
 * Плитки идут с openstreetmap.org напрямую. Это накладывает на нас их
 * usage policy: атрибуция обязательна и отрисована ниже.
 */
export function ContactsMap({
  points,
  onSelectCity,
  onAreaChange,
}: {
  points: ContactsMapPoint[];
  onSelectCity: (point: ContactsMapPoint) => void;
  onAreaChange: (area: ContactsMapArea) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Колбэки живут в ref: пересоздавать карту из-за новой ссылки на функцию
  // нельзя — она мигала бы и теряла положение при каждом рендере родителя.
  // Присвоение вынесено в эффект: во время рендера ref трогать запрещено.
  const selectRef = useRef(onSelectCity);
  const areaRef = useRef(onAreaChange);
  useEffect(() => {
    selectRef.current = onSelectCity;
    areaRef.current = onAreaChange;
  }, [onSelectCity, onAreaChange]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      // Пока грузился Leaflet, компонент могли размонтировать.
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        // Прокрутка страницы важнее зума: колесо над картой не должно
        // ловить страницу в ловушку. Зум остаётся кнопками и щипком.
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Метки перерисовываются целиком: точек в справочнике десятки, а не тысячи,
  // и полная замена слоя проще и надёжнее диффа по городам.
  useEffect(() => {
    if (!ready) return;
    const layer = markersRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    let disposed = false;
    void (async () => {
      const L = await import("leaflet");
      if (disposed) return;
      layer.clearLayers();

      for (const point of points) {
        const label = `${point.city}${point.count > 1 ? ` · ${point.count}` : ""}`;
        L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="contacts-map-pin">${escapeHtml(label)}</span>`,
            // Якорь по центру: подпись растёт в обе стороны от точки города.
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          // Метка городская, но озвучить её всё равно нужно.
          alt: `${point.city}: ${point.count}`,
          keyboard: true,
        })
          .on("click", () => {
            map.flyTo([point.lat, point.lon], CITY_ZOOM);
            selectRef.current(point);
          })
          .addTo(layer);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [points, ready]);

  function searchHere() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    // Радиус — половина диагонали видимой области: круг, накрывающий кадр.
    // Меньший радиус оставлял бы за бортом углы, которые человек видит.
    const bounds = map.getBounds();
    const diagonalMeters = map
      .distance(bounds.getNorthWest(), bounds.getSouthEast());
    areaRef.current({
      lat: round(center.lat),
      lon: round(center.lng),
      radiusKm: Math.max(1, Math.ceil(diagonalMeters / 2000)),
    });
  }

  return (
    <div>
      <div
        ref={containerRef}
        data-testid="contacts-map"
        role="application"
        aria-label="Карта справочника «Контакты»"
        // Фон инлайном, а не классом: стили Leaflet приходят импортом из
        // этого же компонента и встают ПОСЛЕ таблицы приложения, поэтому
        // его собственный светло-серый `.leaflet-container` перебивал бы
        // любой наш селектор той же специфичности и мигал бы на тёмной
        // странице всё время загрузки плиток. Переменная взята напрямую —
        // она сама переключается вместе со светлой темой.
        style={{ background: "var(--vm-bg-1, #150C24)" }}
        className="h-[420px] w-full overflow-hidden rounded-2xl border border-glass-brd"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={searchHere}
          disabled={!ready}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)] disabled:opacity-50"
        >
          Искать в этой области
        </button>
        <span className="text-xs text-text-2">
          Метка — город, а не адрес: в профиле хранится только город. Щелчок по
          метке покажет людей из него.
        </span>
      </div>
    </div>
  );
}

/** Метка рисуется как HTML внутри divIcon — название города экранируем. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Четыре знака — та же точность, что геокодер кладёт в профиль. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
