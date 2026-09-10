"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { TravelPlaceDto } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/** Пол-Евразии в кадре: маршруты преданных тянутся от Москвы до Маяпура. */
const DEFAULT_CENTER: [number, number] = [40, 60];
const DEFAULT_ZOOM = 3;
const PLACE_ZOOM = 10;

const BRAND_PREFIX =
  '<span class="notices-map-brand">' +
  '<img src="/brand/mark-dark.png" alt="" width="12" height="12" />VedaMatch' +
  "</span>";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface TravelMapProps {
  places: TravelPlaceDto[];
  onSelectPlace: (placeId: string) => void;
}

/**
 * Карта мест. Клик по метке выбирает точку — тот же выбор, что и кнопкой в
 * списке под картой: у одного действия должен быть один обработчик, а не два
 * разошедшихся.
 */
export function TravelMap({ places, onSelectPlace }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  // Обработчик в ref: метки перерисовываются реже, чем меняется замыкание, и
  // без этого карта звала бы устаревшую версию. Присваивание — в эффекте, а
  // не в теле: правка ref во время рендера ломает конкурентный рендер React.
  const selectRef = useRef(onSelectPlace);
  useEffect(() => {
    selectRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        // Колесо включается по клику: иначе страница ловится в ловушку.
        scrollWheelZoom: false,
        attributionControl: false,
      });
      map.on("click", () => map?.scrollWheelZoom.enable());
      containerRef.current.addEventListener("mouseleave", () => {
        map?.scrollWheelZoom.disable();
      });
      L.control
        .attribution({ position: "bottomright", prefix: BRAND_PREFIX })
        .addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        // Атрибуция OSM обязательна: данные под ODbL, видимый кредит — условие
        // использования плиток.
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = markersRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    let disposed = false;
    void (async () => {
      const L = await import("leaflet");
      if (disposed) return;
      layer.clearLayers();

      for (const place of places) {
        const label = `${place.name} · ${place.stayCount}`;
        L.marker([place.lat, place.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span class="travel-map-place">${escapeHtml(label)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `${place.name}: мест ночлега ${place.stayCount}`,
          keyboard: true,
        })
          .on("click", () => {
            map.flyTo([place.lat, place.lng], PLACE_ZOOM);
            selectRef.current(place.id);
          })
          .addTo(layer);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [places]);

  return (
    <div
      ref={containerRef}
      className="h-80 w-full overflow-hidden rounded-2xl border border-glass-brd"
      // Карта — не заголовок и не таблица: скринридеру от неё пользы нет, а
      // весь её смысл продублирован списком мест ниже.
      role="application"
      aria-label="Карта мест"
    />
  );
}
