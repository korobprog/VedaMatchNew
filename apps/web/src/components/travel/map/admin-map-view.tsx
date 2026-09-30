"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  travelMapPlaceKindOption,
  type TravelMapPlaceDto,
  type TravelMapReportDto,
  type TravelMapReportStatus,
} from "@vedamatch/shared";
import {
  getAdminTravelMapPlaces,
  getAdminTravelMapReports,
  hideTravelMapPlace,
  resolveTravelMapReport,
  unhideTravelMapPlace,
  unverifyTravelMapPlace,
  verifyTravelMapPlace,
} from "@/lib/travel-map-api";

const fieldClass =
  "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
const smallButton =
  "rounded-lg border border-glass-brd px-3 py-1 text-sm text-text-1";

type Tab = "places" | "reports";

export function AdminMapView() {
  const [tab, setTab] = useState<Tab>("places");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Разделы модерации карты" className="mb-4 flex gap-2">
        {(
          [
            ["places", "Места"],
            ["reports", "Жалобы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-xl border px-3 py-2 text-sm ${
              tab === id
                ? "border-magenta text-text-0"
                : "border-glass-brd text-text-1"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      {tab === "places" ? (
        <PlacesTab onError={setError} />
      ) : (
        <ReportsTab onError={setError} />
      )}
    </div>
  );
}

function PlacesTab({ onError }: { onError: (message: string | null) => void }) {
  const [status, setStatus] = useState<"" | "active" | "hidden">("");
  const [verified, setVerified] = useState<"" | "0" | "1">("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<TravelMapPlaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getAdminTravelMapPlaces(
        {
          status: status || undefined,
          verified: verified || undefined,
          q: q.trim() || undefined,
        },
        controller.signal,
      )
        .then((res) => {
          setItems(res);
          onError(null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          onError(cause instanceof Error ? cause.message : "Не загрузилось");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [status, verified, q, reloadKey, onError]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      onError(null);
      try {
        await action();
        setReloadKey((n) => n + 1);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : "Не получилось");
      }
    },
    [onError],
  );

  return (
    <section aria-label="Места">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-text-2">
          <span className="sr-only">Статус</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className={fieldClass}
          >
            <option value="">Любой статус</option>
            <option value="active">Видно всем</option>
            <option value="hidden">Скрыто</option>
          </select>
        </label>
        <label className="text-xs text-text-2">
          <span className="sr-only">Проверка</span>
          <select
            value={verified}
            onChange={(event) => setVerified(event.target.value as typeof verified)}
            className={fieldClass}
          >
            <option value="">Проверено и нет</option>
            <option value="1">Проверено</option>
            <option value="0">Не проверено</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 basis-48">
          <span className="sr-only">Поиск по названию</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Поиск по названию"
            className={`${fieldClass} w-full`}
          />
        </label>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-2">Ничего не найдено.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((place) => {
            const option = travelMapPlaceKindOption(place.kind);
            return (
              <li
                key={place.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-glass-brd p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/travel/map/places/${place.id}`}
                    className="text-sm text-text-0 underline"
                  >
                    <span aria-hidden="true">{option.icon} </span>
                    {place.name}
                  </Link>
                  <p className="text-xs text-text-2">
                    {option.label}
                    {place.city ? ` · ${place.city}` : ""}
                    {place.verified ? " · проверено" : " · не проверено"}
                    {place.status === "hidden"
                      ? ` · скрыто${place.hiddenReason ? `: ${place.hiddenReason}` : ""}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {place.verified ? (
                    <button
                      type="button"
                      className={smallButton}
                      aria-label={`Снять проверку: ${place.name}`}
                      onClick={() => act(() => unverifyTravelMapPlace(place.id))}
                    >
                      Снять
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={smallButton}
                      aria-label={`Подтвердить: ${place.name}`}
                      onClick={() => act(() => verifyTravelMapPlace(place.id))}
                    >
                      Подтвердить
                    </button>
                  )}
                  {place.status === "hidden" ? (
                    <button
                      type="button"
                      className={smallButton}
                      aria-label={`Показать: ${place.name}`}
                      onClick={() => act(() => unhideTravelMapPlace(place.id))}
                    >
                      Показать
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={smallButton}
                      aria-label={`Спрятать: ${place.name}`}
                      onClick={() => {
                        const reason = window.prompt(
                          `Причина, почему прячем «${place.name}» (её увидит автор):`,
                          "",
                        );
                        if (reason === null) return;
                        void act(() =>
                          hideTravelMapPlace(place.id, reason.trim() || undefined),
                        );
                      }}
                    >
                      Спрятать
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ReportsTab({ onError }: { onError: (message: string | null) => void }) {
  const [status, setStatus] = useState<TravelMapReportStatus>("open");
  const [items, setItems] = useState<TravelMapReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAdminTravelMapReports({ status }, controller.signal)
      .then((res) => {
        setItems(res);
        onError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        onError(cause instanceof Error ? cause.message : "Не загрузилось");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, reloadKey, onError]);

  return (
    <section aria-label="Жалобы">
      <div className="mb-4 flex gap-2">
        {(
          [
            ["open", "Открытые"],
            ["resolved", "Разобранные"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={status === id}
            onClick={() => {
              setLoading(true);
              setStatus(id);
            }}
            className={`rounded-xl border px-3 py-2 text-sm ${
              status === id
                ? "border-magenta text-text-0"
                : "border-glass-brd text-text-1"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p role="status" className="text-sm text-text-2">
          Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-2">Жалоб нет.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((report) => (
            <li
              key={report.id}
              className="rounded-xl border border-glass-brd p-3 text-sm"
            >
              <Link
                href={`/travel/map/places/${report.placeId}`}
                className="text-text-0 underline"
              >
                {report.placeName}
              </Link>
              <p className="mt-1 whitespace-pre-line text-text-1">{report.reason}</p>
              <p className="mt-1 text-xs text-text-2">
                {report.reporter ? `${report.reporter.name} · ` : ""}
                {new Date(report.createdAt).toLocaleString("ru-RU")}
              </p>
              {report.status === "open" ? (
                <button
                  type="button"
                  className={`${smallButton} mt-2`}
                  aria-label={`Отметить разобранной: жалоба на ${report.placeName}`}
                  onClick={async () => {
                    onError(null);
                    try {
                      await resolveTravelMapReport(report.id);
                      setReloadKey((n) => n + 1);
                    } catch (cause) {
                      onError(
                        cause instanceof Error ? cause.message : "Не получилось",
                      );
                    }
                  }}
                >
                  Разобрано
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
