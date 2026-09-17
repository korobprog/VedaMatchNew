"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { TravelPlaceDto } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/** Пол-Евразии в кадре: маршруты преданных тянутся от Москвы до Маяпура. */
const DEFAULT_CENTER: [number, number] = [40, 60];
const DEFAULT_ZOOM = 3;
const PLACE_ZOOM = 10;
/** Ближе при подгонке не подходим: одна точка иначе открылась бы улицей. */
const FIT_MAX_ZOOM = 6;

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
  // Карта создаётся асинхронно (Leaflet грузится отдельным чанком), а места
  // приходят раньше неё. Без флага эффект меток отрабатывал до готовности
  // карты, выходил ни с чем и больше не запускался — метки не появлялись.
  const [ready, setReady] = useState(false);
  const fittedRef = useRef(false);
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
        // Колесо приближает сразу: карта здесь — главный способ выбрать
        // место, и требование сперва кликнуть люди не угадывали. На телефоне
        // зум двумя пальцами Leaflet включает сам (touchZoom по умолчанию).
        scrollWheelZoom: true,
        attributionControl: false,
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
      setReady(true);
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      markersRef.current = null;
      fittedRef.current = false;
      setReady(false);
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

      // Первый вид — по точкам, а не пол-Евразии: все места в Индии, и на
      // общем плане подписи слипались в одну кучу. Только один раз, чтобы
      // перерисовка меток не сбрасывала зум, который человек уже выбрал.
      if (!fittedRef.current && places.length) {
        fittedRef.current = true;
        map.fitBounds(
          L.latLngBounds(places.map((place) => [place.lat, place.lng])),
          { padding: [48, 48], maxZoom: FIT_MAX_ZOOM },
        );
      }
    })();

    return () => {
      disposed = true;
    };
  }, [places, ready]);

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
