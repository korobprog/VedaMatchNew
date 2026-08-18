"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { NoticeMapResponse } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/** Вся Россия и соседи в кадре — карта открывается «где все», а не в океане. */
const DEFAULT_CENTER: [number, number] = [55.75, 60];
const DEFAULT_ZOOM = 3;
const CITY_ZOOM = 11;

/**
 * Берётся тёмная версия знака: плашка атрибуции тёмная в обеих темах, а в
 * светлой версии «M» запечена тёмно-синим и на ней тонет. Компонент
 * `VedaMatchMark` сюда не годится — Leaflet принимает атрибуцию строкой
 * HTML, не React-узлом.
 */
const BRAND_PREFIX =
  '<span class="notices-map-brand">' +
  '<img src="/brand/mark-dark.png" alt="" width="12" height="12" />VedaMatch' +
  "</span>";

export interface MapArea {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom: number;
}

/**
 * Команды, которые можно отдать карте снаружи. Ровно то же самое действие,
 * что уже делает клик по агрегату на самой карте, — список под картой должен
 * повторять его, а не изобретать своё.
 */
export interface NoticesMapHandle {
  flyTo: (lat: number, lon: number) => void;
}

interface NoticesMapProps {
  data: NoticeMapResponse | null;
  onAreaChange: (area: MapArea) => void;
  onSelectNotice: (id: string) => void;
}

/**
 * Карта доски. Копия механики contacts-map.tsx — компоненты чужого сервиса
 * импортировать нельзя, см. docs/service-module-contract.md.
 *
 * Отличие в том, что здесь два режима. Contacts кластеризует только по
 * городам, потому что в профиле человека ничего точнее города нет. У доски
 * есть общины и площадки событий с настоящим адресом, поэтому на крупном
 * зуме показываются точки, а на мелком — агрегаты. Режим выбирает сервер:
 * только он знает, сколько записей в рамке.
 *
 * Leaflet грузится динамическим `import()` внутри эффекта: он трогает
 * `window` прямо при вычислении модуля, и статический импорт уронил бы
 * серверный рендер страницы.
 */
export const NoticesMap = forwardRef<NoticesMapHandle, NoticesMapProps>(
  function NoticesMap({ data, onAreaChange, onSelectNotice }, handleRef) {
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

    // Колбэки живут в ref: пересоздавать карту из-за новой ссылки на функцию
    // нельзя — она мигала бы и теряла положение при каждом рендере родителя.
    const areaRef = useRef(onAreaChange);
    const selectRef = useRef(onSelectNotice);
    useEffect(() => {
      areaRef.current = onAreaChange;
      selectRef.current = onSelectNotice;
    }, [onAreaChange, onSelectNotice]);

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

        // Рамку запрашиваем на каждое движение: карта показывает то, что видно,
        // а не то, что попало в первый запрос.
        const report = () => {
          const bounds = map!.getBounds();
          areaRef.current({
            minLat: round(bounds.getSouth()),
            maxLat: round(bounds.getNorth()),
            minLon: round(bounds.getWest()),
            maxLon: round(bounds.getEast()),
            zoom: map!.getZoom(),
          });
        };
        map.on("moveend", report);
        setReady(true);
        report();
      })();

      return () => {
        disposed = true;
        map?.remove();
        mapRef.current = null;
        markersRef.current = null;
      };
    }, []);

    // Метки перерисовываются целиком: их не больше трёхсот по договорённости
    // с сервером, и полная замена слоя проще и надёжнее диффа.
    useEffect(() => {
      if (!ready || !data) return;
      const layer = markersRef.current;
      const map = mapRef.current;
      if (!layer || !map) return;

      let disposed = false;
      void (async () => {
        const L = await import("leaflet");
        if (disposed) return;
        layer.clearLayers();

        if (data.mode === "clusters") {
          for (const cluster of data.clusters) {
            const label = `${cluster.city} · ${cluster.count}`;
            L.marker([cluster.lat, cluster.lon], {
              icon: L.divIcon({
                className: "",
                html: `<span class="notices-map-cluster">${escapeHtml(label)}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              }),
              alt: `${cluster.city}: объявлений ${cluster.count}`,
              keyboard: true,
            })
              .on("click", () => map.flyTo([cluster.lat, cluster.lon], CITY_ZOOM))
              .addTo(layer);
          }
          return;
        }

        for (const point of data.points) {
          L.marker([point.lat, point.lon], {
            icon: L.divIcon({
              className: "",
              html: `<span class="notices-map-pin" data-precision="${point.precision}">${escapeHtml(point.title)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
            alt: point.title,
            keyboard: true,
          })
            .on("click", () => selectRef.current(point.id))
            .addTo(layer);
        }
      })();

      return () => {
        disposed = true;
      };
    }, [data, ready]);

    return (
      <div>
        <div
          ref={containerRef}
          data-testid="notices-map"
          role="application"
          aria-label="Карта объявлений"
          // Фон инлайном, а не классом: стили Leaflet приходят импортом из
          // этого же компонента и встают ПОСЛЕ таблицы приложения, поэтому его
          // светло-серый `.leaflet-container` перебивал бы любой наш селектор
          // той же специфичности и мигал бы на тёмной странице.
          style={{ background: "var(--vm-bg-1, #150C24)" }}
          className="h-[420px] w-full overflow-hidden rounded-2xl border border-glass-brd"
        />
        <p className="mt-3 text-xs text-text-2">
          Пунктирная метка — центр города: объявления людей не показывают их
          адрес. Сплошная — настоящее место: храм, площадка, община.
          {data?.withoutLocation ? (
            <> Ещё {data.withoutLocation} без города — их видно только в списке.</>
          ) : null}
        </p>
      </div>
    );
  },
);

/** Метка рисуется как HTML внутри divIcon — текст экранируем. */
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
