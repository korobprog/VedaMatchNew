"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ChatMapCommunity } from "@vedamatch/shared";
// Стили Leaflet обязательны: без них слои плиток позиционируются как обычные
// блоки и карта рассыпается в вертикальную колонку картинок.
import "leaflet/dist/leaflet.css";

/**
 * Карта общин на публичной странице «Общения». Гость видит настоящие точки —
 * те же, что участник портала на /chat/map, — но без городов со счётчиком
 * людей: наружу уходят только организации, см. ChatPublicMapState.
 *
 * Механика повторяет components/chat/chat-map.tsx, а не импортирует его:
 * компоненты сервиса лендингу не принадлежат, и общее здесь дублируется —
 * docs/service-module-contract.md. Отличия осознанные: нет слоя городов, нет
 * отчёта о кадре (списка под картой тут нет) и нет перехода в беседу —
 * гостю некуда идти до входа, поэтому метка только приближает.
 */

/** Вся Россия и соседи в кадре — карта открывается «где все», а не в океане. */
const DEFAULT_CENTER: [number, number] = [55.75, 60];
const DEFAULT_ZOOM = 3;
const CITY_ZOOM = 11;

const BRAND_PREFIX =
  '<span class="notices-map-brand">' +
  '<img src="/brand/mark-dark.png" alt="" width="12" height="12" />VedaMatch' +
  "</span>";

export function CommunitiesMap({
  communities,
}: {
  communities: ChatMapCommunity[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;
    const container = containerRef.current;

    void (async () => {
      // Leaflet грузится динамическим `import()` внутри эффекта: он трогает
      // `window` прямо при вычислении модуля, и статический импорт уронил бы
      // серверный рендер страницы.
      const L = await import("leaflet");
      if (disposed || !container) return;

      map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        // Колесо включается не сразу, а после нажатия по карте: иначе человек
        // листает страницу, курсор проходит над картой — и вместо страницы
        // уезжает масштаб. Щипок на телефоне включён всегда, там прокрутка и
        // масштаб не спорят.
        scrollWheelZoom: false,
        attributionControl: false,
      });
      map.on("click", () => map?.scrollWheelZoom.enable());
      container.addEventListener("mouseleave", disableWheel);

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

    function disableWheel() {
      mapRef.current?.scrollWheelZoom.disable();
    }

    return () => {
      disposed = true;
      container?.removeEventListener("mouseleave", disableWheel);
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
        const talks = point.channels + point.groups;
        const label = talks
          ? `${point.community.name} · ${talks}`
          : point.community.name;

        L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="chat-map-pin">${escapeHtml(label)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `${point.community.name}: открытых бесед ${talks}`,
          keyboard: true,
        })
          .on("click", () => map.flyTo([point.lat, point.lon], CITY_ZOOM))
          .addTo(layer);
      }

      // Кадр по фактическим точкам: пока общин мало, вид «вся Россия»
      // оставляет пустую карту с одинокой меткой в углу.
      if (communities.length > 0) {
        map.fitBounds(
          communities.map((point): [number, number] => [point.lat, point.lon]),
          { padding: [48, 48], maxZoom: 9 },
        );
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
      aria-label="Карта общин портала"
      className="h-[420px] w-full overflow-hidden rounded-3xl border border-glass-brd"
    />
  );
}

/** Подпись метки уходит в Leaflet строкой HTML — экранируем руками. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
