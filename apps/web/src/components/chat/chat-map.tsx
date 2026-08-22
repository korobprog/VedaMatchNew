"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ChatMapCity, ChatMapCommunity } from "@vedamatch/shared";
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
  /** Вернуть в кадр все метки: выход из «пустого места» одним нажатием. */
  fitAll: () => void;
}

/** Что сейчас видно на карте. Списки под ней показывают ровно это. */
export interface ChatMapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Карта сервиса «Общение»: общины и города. Механика повторяет notices-map.tsx —
 * компоненты чужого сервиса импортировать нельзя, см.
 * docs/service-module-contract.md.
 *
 * Слоя два: общины и города. Метки человека на карте нет — в профиле указан
 * город, а не адрес, и точка на публичной карте была бы другим уровнем
 * раскрытия, чем он соглашался. Поэтому город получает одну метку со
 * счётчиком тех, кто сам согласился показываться, а кто именно за этим числом
 * — видно только в справочнике, по его же правилам видимости.
 *
 * Leaflet грузится динамическим `import()` внутри эффекта: он трогает
 * `window` прямо при вычислении модуля, и статический импорт уронил бы
 * серверный рендер страницы.
 */
export const ChatMap = forwardRef<
  ChatMapHandle,
  {
    communities: ChatMapCommunity[];
    cities: ChatMapCity[];
    onSelect: (communityId: string) => void;
    onSelectCity: (city: string) => void;
    /** Кадр изменился: сдвинули, приблизили или вернули всё в вид. */
    onBoundsChange: (bounds: ChatMapBounds) => void;
  }
>(function ChatMap(
  { communities, cities, onSelect, onSelectCity, onBoundsChange },
  handleRef,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Точки живут в ref: обработчик карты создаётся один раз, а список меток
  // меняется — без этого «показать всё» возвращало бы устаревший набор.
  const pointsRef = useRef<Array<[number, number]>>([]);
  pointsRef.current = [
    ...communities.map((point): [number, number] => [point.lat, point.lon]),
    ...cities.map((point): [number, number] => [point.lat, point.lon]),
  ];

  useImperativeHandle(
    handleRef,
    () => ({
      flyTo: (lat, lon) => mapRef.current?.flyTo([lat, lon], CITY_ZOOM),
      fitAll: () => {
        const map = mapRef.current;
        const points = pointsRef.current;
        if (!map || points.length === 0) return;
        map.fitBounds(points, { padding: [40, 40], maxZoom: CITY_ZOOM });
      },
    }),
    [],
  );

  // Колбэк живёт в ref: пересоздавать карту из-за новой ссылки на функцию
  // нельзя — она мигала бы и теряла положение при каждом рендере родителя.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const selectCityRef = useRef(onSelectCity);
  useEffect(() => {
    selectCityRef.current = onSelectCity;
  }, [onSelectCity]);

  const boundsRef = useRef(onBoundsChange);
  useEffect(() => {
    boundsRef.current = onBoundsChange;
  }, [onBoundsChange]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        // Колесо включается не сразу, а после нажатия на карту — см. ниже.
        scrollWheelZoom: false,
        attributionControl: false,
      });

      /**
       * Колесом карта приближается только после того, как по ней нажали.
       *
       * Включить колесо сразу — значит поймать в ловушку страницу: человек
       * листает вниз, курсор проходит над картой, и вместо страницы уезжает
       * масштаб. Выключить совсем — колесо не работает вовсе, а это первое,
       * что пробуют мышью. Нажатие по карте — осознанный вход в неё; увёл
       * курсор — колесо снова отдано странице.
       *
       * Щипок на телефоне (`touchZoom`) включён всегда: там прокрутка
       * страницы и масштаб карты не спорят между собой.
       */
      map.on('click', () => map?.scrollWheelZoom.enable());
      containerRef.current.addEventListener('mouseleave', () => {
        map?.scrollWheelZoom.disable();
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

      // Кадр сообщаем и сразу, и на каждое движение: списки под картой
      // показывают то же, что видно в ней.
      const report = () => {
        const bounds = map?.getBounds();
        if (!bounds) return;
        boundsRef.current({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        });
      };
      map.on('moveend', report);
      map.on('zoomend', report);
      report();

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

      // Города рисуются первыми: метка общины важнее и должна лечь поверх.
      for (const point of cities) {
        const label = `${point.city} · ${point.people}`;
        L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="chat-map-pin chat-map-pin--people">${escapeHtml(label)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `${point.city}: людей на карте ${point.people}`,
          keyboard: true,
        })
          .on("click", () => {
            map.flyTo([point.lat, point.lon], CITY_ZOOM);
            selectCityRef.current(point.city);
          })
          .addTo(layer);
      }

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
  }, [ready, communities, cities]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Карта общин и городов"
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
