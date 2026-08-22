"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ChatMapCommunity } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/** Вся Россия и соседи в кадре — карта открывается «где все», а не в океане. */
const DEFAULT_CENTER: [number, number] = [55.75, 60];
const DEFAULT_ZOOM = 3;
const CITY_ZOOM = 11;

const BRAND_PREFIX =
  '<span class="notices-map-brand">' +
  '<img src="/brand/mark-dark.png" alt="" width="12" height="12" />VedaMatch' +
  "</span>";

export interface ChatMapHandle {
  flyTo: (lat: number, lon: number) => void;
}

/**
 * Карта общин сервиса «Общение». Механика повторяет notices-map.tsx —
 * компоненты чужого сервиса импортировать нельзя, см.
 * docs/service-module-contract.md.
 *
 * Отличие в том, что здесь одна метка на общину и никаких людей: в профиле
 * человека указан город, а не адрес, и точка на публичной карте — это
 * другой уровень раскрытия, чем он соглашался.
 *
 * Leaflet грузится динамическим `import()` внутри эффекта: он трогает
 * `window` прямо при вычислении модуля, и статический импорт уронил бы
 * серверный рендер страницы.
 */
export const ChatMap = forwardRef<
  ChatMapHandle,
  {
    communities: ChatMapCommunity[];
    onSelect: (communityId: string) => void;
  }
>(function ChatMap({ communities, onSelect }, handleRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useImperativeHandle(
    handleRef,
    () => ({
      flyTo: (lat, lon) => mapRef.current?.flyTo([lat, lon], CITY_ZOOM),
    }),
    [],
  );

  // Колбэк живёт в ref: пересоздавать карту из-за новой ссылки на функцию
  // нельзя — она мигала бы и теряла положение при каждом рендере родителя.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        // Прокрутка страницы важнее зума: колесо над картой не должно ловить
        // страницу в ловушку. Зум остаётся кнопками и щипком.
        scrollWheelZoom: false,
        attributionControl: false,
      });
      L.control
        .attribution({ position: "bottomright", prefix: BRAND_PREFIX })
        .addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        // Атрибуция OSM обязательна: плитки идут с tile.openstreetmap.org,
        // данные под ODbL, видимый кредит — условие использования.
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
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

      for (const point of communities) {
        const beseds = point.channels + point.groups;
        const label = beseds
          ? `${point.community.name} · ${beseds}`
          : point.community.name;

        L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="chat-map-pin">${escapeHtml(label)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `${point.community.name}: открытых бесед ${beseds}`,
          keyboard: true,
        })
          .on("click", () => {
            map.flyTo([point.lat, point.lon], CITY_ZOOM);
            selectRef.current(point.community.id);
          })
          .addTo(layer);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [ready, communities]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Карта общин"
      className="h-[420px] w-full overflow-hidden rounded-3xl border border-glass-brd"
    />
  );
});

/** Подпись метки уходит в Leaflet строкой HTML — экранируем руками. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
