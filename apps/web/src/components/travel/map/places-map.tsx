"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import {
  travelMapPlaceKindOption,
  type TravelMapCommunityPointDto,
  type TravelMapPointDto,
  type TravelMapStayPointDto,
  TRAVEL_STAY_KIND_LABELS,
  type TravelStayKind,
} from "@vedamatch/shared";
import type { MapBounds } from "./map-filters";
// Стили Leaflet обязательны: без них плитки рассыпаются в колонку картинок.
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [55.75, 37.62];
const DEFAULT_ZOOM = 4;
const PLACE_ZOOM = 14;
const USER_ZOOM = 10;

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

export interface FlyTarget {
  lat: number;
  lng: number;
  /** Меняется на каждый запрос, чтобы повторный клик по тому же месту сработал. */
  key: number;
  zoom?: number;
}

interface PlacesMapProps {
  points?: TravelMapPointDto[];
  communities?: TravelMapCommunityPointDto[];
  stays?: TravelMapStayPointDto[];
  onBoundsChange?: (bounds: MapBounds) => void;
  onSelectPoint?: (id: string) => void;
  onOpenCommunity?: (slug: string) => void;
  onSelectStay?: (id: string) => void;
  activeId?: string | null;
  flyTarget?: FlyTarget | null;
  /** Режим выбора точки: клик ставит один перетаскиваемый маркер. */
  pickMode?: boolean;
  pickValue?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  /** Стартовый центр (место, которое уже известно). Геолокацию тогда не спрашиваем. */
  initialCenter?: { lat: number; lng: number; zoom?: number } | null;
  ariaLabel?: string;
  className?: string;
}

/**
 * Карта «народных» мест. Механика — как в travel-map.tsx: динамический
 * `import('leaflet')` (он трогает `window` при загрузке модуля), колбэки в
 * ref, чтобы не пересоздавать карту при каждом рендере родителя.
 */
export function PlacesMap({
  points = [],
  communities = [],
  stays = [],
  onBoundsChange,
  onSelectPoint,
  onOpenCommunity,
  onSelectStay,
  activeId = null,
  flyTarget = null,
  pickMode = false,
  pickValue = null,
  onPick,
  initialCenter = null,
  ariaLabel = "Карта мест",
  className,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const pickMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  const boundsRef = useRef(onBoundsChange);
  const selectRef = useRef(onSelectPoint);
  const communityRef = useRef(onOpenCommunity);
  const stayRef = useRef(onSelectStay);
  const pickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  const initialRef = useRef(initialCenter);
  useEffect(() => {
    boundsRef.current = onBoundsChange;
    selectRef.current = onSelectPoint;
    communityRef.current = onOpenCommunity;
    stayRef.current = onSelectStay;
    pickRef.current = onPick;
    pickModeRef.current = pickMode;
  }, [onBoundsChange, onSelectPoint, onOpenCommunity, onSelectStay, onPick, pickMode]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      const start = initialRef.current;
      map = L.map(containerRef.current, {
        center: start ? [start.lat, start.lng] : DEFAULT_CENTER,
        zoom: start?.zoom ?? (start ? PLACE_ZOOM : DEFAULT_ZOOM),
        // Колесо включается кликом по карте: иначе оно перехватывает
        // прокрутку страницы, когда курсор проходит над картой.
        scrollWheelZoom: false,
        attributionControl: false,
      });
      const container = containerRef.current;
      map.on("click", (event) => {
        map?.scrollWheelZoom.enable();
        if (pickModeRef.current) {
          pickRef.current?.(event.latlng.lat, event.latlng.lng);
        }
      });
      container.addEventListener("mouseleave", () => {
        map?.scrollWheelZoom.disable();
      });
      L.control
        .attribution({ position: "bottomright", prefix: BRAND_PREFIX })
        .addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      const report = () => {
        const b = map?.getBounds();
        if (!b) return;
        boundsRef.current?.({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        });
      };
      map.on("moveend", report);
      map.on("zoomend", report);
      report();
      setReady(true);

      // Геолокация — только если разрешение уже выдано: запрос при открытии
      // карты без действия человека пугает.
      if (!start && "geolocation" in navigator && navigator.permissions) {
        void navigator.permissions
          .query({ name: "geolocation" })
          .then((status) => {
            if (status.state !== "granted" || disposed) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (disposed || !mapRef.current) return;
                mapRef.current.setView(
                  [pos.coords.latitude, pos.coords.longitude],
                  USER_ZOOM,
                );
              },
              () => undefined,
              { timeout: 5000 },
            );
          })
          .catch(() => undefined);
      }
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      pickMarkerRef.current = null;
    };
  }, []);

  // Метки мест и общин.
  useEffect(() => {
    if (!ready) return;
    const layer = layerRef.current;
    if (!layer) return;
    let disposed = false;
    void (async () => {
      const L = await import("leaflet");
      if (disposed) return;
      layer.clearLayers();

      for (const point of communities) {
        L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "",
            html:
              `<span class="travel-map-pin travel-map-pin--community">` +
              `<span aria-hidden="true">👥</span>` +
              `<span class="travel-map-pin__label">${escapeHtml(point.name)}</span></span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `Община: ${point.name}`,
          keyboard: true,
        })
          .on("click", () => communityRef.current?.(point.slug))
          .addTo(layer);
      }

      for (const stay of stays) {
        const kindLabel =
          TRAVEL_STAY_KIND_LABELS[stay.kind as TravelStayKind] ?? "Ночлег";
        const classes = [
          "travel-map-pin",
          "travel-map-pin--stay",
          stay.id === activeId ? "travel-map-pin--active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        L.marker([stay.lat, stay.lng], {
          icon: L.divIcon({
            className: "",
            html:
              `<span class="${classes}">` +
              `<span aria-hidden="true">🛏️</span>` +
              `<span class="travel-map-pin__label">${escapeHtml(stay.name)}</span></span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `Ночлег, ${kindLabel}: ${stay.name}`,
          keyboard: true,
          zIndexOffset: stay.id === activeId ? 1000 : 0,
        })
          .on("click", () => stayRef.current?.(stay.id))
          .addTo(layer);
      }

      for (const point of points) {
        const option = travelMapPlaceKindOption(point.kind);
        const classes = [
          "travel-map-pin",
          point.verified ? "" : "travel-map-pin--unverified",
          point.id === activeId ? "travel-map-pin--active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "",
            html:
              `<span class="${classes}">` +
              `<span aria-hidden="true">${option.icon}</span>` +
              `<span class="travel-map-pin__label">${escapeHtml(point.name)}</span></span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          alt: `${option.label}: ${point.name}${point.verified ? "" : ", не проверено"}`,
          keyboard: true,
          zIndexOffset: point.id === activeId ? 1000 : 0,
        })
          .on("click", () => selectRef.current?.(point.id))
          .addTo(layer);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [ready, points, communities, stays, activeId]);

  // Единственный маркер выбора точки.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    let disposed = false;
    void (async () => {
      const L = await import("leaflet");
      if (disposed) return;
      if (!pickMode || !pickValue) {
        pickMarkerRef.current?.remove();
        pickMarkerRef.current = null;
        return;
      }
      const latlng: [number, number] = [pickValue.lat, pickValue.lng];
      if (pickMarkerRef.current) {
        pickMarkerRef.current.setLatLng(latlng);
        return;
      }
      const marker = L.marker(latlng, {
        draggable: true,
        keyboard: true,
        alt: "Выбранная точка, перетащите её, чтобы уточнить",
        icon: L.divIcon({
          className: "",
          html: '<span class="travel-map-pick" aria-hidden="true">📍</span>',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const at = marker.getLatLng();
        pickRef.current?.(at.lat, at.lng);
      });
      pickMarkerRef.current = marker;
    })();
    return () => {
      disposed = true;
    };
  }, [ready, pickMode, pickValue]);

  // Полёт к месту из списка или из адресной строки.
  useEffect(() => {
    if (!ready || !flyTarget) return;
    mapRef.current?.flyTo(
      [flyTarget.lat, flyTarget.lng],
      flyTarget.zoom ?? PLACE_ZOOM,
    );
  }, [ready, flyTarget]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={
        className ??
        "h-[min(70dvh,640px)] w-full overflow-hidden rounded-3xl border border-glass-brd"
      }
    />
  );
}
