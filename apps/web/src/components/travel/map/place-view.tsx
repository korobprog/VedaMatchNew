"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LINEAGES,
  TRAVEL_MAP_PLACE_PHOTOS_MAX,
  travelMapPlaceKindOption,
  type TravelMapPlaceDto,
} from "@vedamatch/shared";
import {
  deleteTravelMapPhoto,
  deleteTravelMapPlace,
  getTravelMapPlace,
  reportTravelMapPlace,
  uploadTravelMapPhoto,
} from "@/lib/travel-map-api";
import { PlacesMap } from "./places-map";

const buttonClass =
  "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1";

function externalUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function PlaceView({ id }: { id: string }) {
  const router = useRouter();
  const [place, setPlace] = useState<TravelMapPlaceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapPlace(id, controller.signal)
      .then(setPlace)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  if (error && !place) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!place) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  const option = travelMapPlaceKindOption(place.kind);
  const lineage = place.lineage
    ? LINEAGES.find((item) => item.id === place.lineage)
    : null;

  return (
    <article>
      {place.status === "hidden" && place.canEdit ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-gold bg-bg-1 p-3 text-sm text-text-0"
        >
          Место скрыто администрацией.
          {place.hiddenReason ? ` Причина: ${place.hiddenReason}` : ""}
        </p>
      ) : null}

      <p className="text-xs uppercase tracking-wide text-text-2">
        <span aria-hidden="true">{option.icon} </span>
        {option.label}
      </p>
      <h1 className="mt-1 font-display text-3xl text-text-0">{place.name}</h1>
      <p className="mt-2 flex flex-wrap gap-2 text-xs">
        <span
          className={`rounded-full border px-2 py-1 ${
            place.verified
              ? "border-cyan text-text-0"
              : "border-glass-brd text-text-2"
          }`}
        >
          {place.verified ? "Проверено" : "Не проверено"}
        </span>
        {lineage ? (
          <span className="rounded-full border border-glass-brd px-2 py-1 text-text-1">
            {lineage.label}
          </span>
        ) : null}
      </p>

      {place.photoUrls.length > 0 ? (
        <ul className="mt-4 flex gap-3 overflow-x-auto" aria-label="Фотографии">
          {place.photoUrls.map((url, index) => (
            <li key={url} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${place.name}, фото ${index + 1}`}
                className="h-48 w-auto rounded-2xl border border-glass-brd object-cover"
              />
              {place.canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Удалить фото ${index + 1}`}
                  onClick={() =>
                    run(async () => setPlace(await deleteTravelMapPhoto(id, index)))
                  }
                  className="mt-1 text-xs text-magenta underline"
                >
                  Удалить фото
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {place.canEdit && place.photoUrls.length < TRAVEL_MAP_PLACE_PHOTOS_MAX ? (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Выбрать фото"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file)
                void run(async () => setPlace(await uploadTravelMapPhoto(id, file)));
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={buttonClass}
          >
            Добавить фото ({place.photoUrls.length}/{TRAVEL_MAP_PLACE_PHOTOS_MAX})
          </button>
        </div>
      ) : null}

      <dl className="mt-5 space-y-2 text-sm text-text-1">
        {place.address ? (
          <div>
            <dt className="text-xs text-text-2">Адрес</dt>
            <dd>{place.address}</dd>
          </div>
        ) : null}
        {place.openingHours ? (
          <div>
            <dt className="text-xs text-text-2">Часы работы</dt>
            <dd>{place.openingHours}</dd>
          </div>
        ) : null}
        {place.website ? (
          <div>
            <dt className="text-xs text-text-2">Сайт</dt>
            <dd>
              <a
                href={externalUrl(place.website)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-cyan underline"
              >
                {place.website}
              </a>
            </dd>
          </div>
        ) : null}
        {place.phone ? (
          <div>
            <dt className="text-xs text-text-2">Телефон</dt>
            <dd>
              <a
                href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}
                className="text-cyan underline"
              >
                {place.phone}
              </a>
            </dd>
          </div>
        ) : null}
        {place.telegram ? (
          <div>
            <dt className="text-xs text-text-2">Телеграм</dt>
            <dd>
              <a
                href={`https://t.me/${place.telegram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-cyan underline"
              >
                {place.telegram}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {place.description ? (
        <p className="mt-5 whitespace-pre-line text-sm text-text-1">
          {place.description}
        </p>
      ) : null}

      {place.author ? (
        <p className="mt-4 text-xs text-text-2">
          Добавил(а): {place.author.name}
          {place.author.isAgent ? " · ИИ" : ""}
        </p>
      ) : null}

      <div className="mt-6">
        <PlacesMap
          points={[place]}
          initialCenter={{ lat: place.lat, lng: place.lng, zoom: 14 }}
          ariaLabel={`Мини-карта: ${place.name}`}
          className="h-64 w-full overflow-hidden rounded-3xl border border-glass-brd"
        />
        <Link
          href={`/travel/map?focus=${place.id}`}
          className="mt-2 inline-block text-sm text-cyan underline"
        >
          Показать на карте
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 text-sm text-text-1">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {place.canEdit ? (
          <>
            <Link
              href={`/travel/map/places/${place.id}/edit`}
              className={buttonClass}
            >
              Изменить
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Удалить место «${place.name}»?`)) return;
                void run(async () => {
                  await deleteTravelMapPlace(id);
                  router.push("/travel/map");
                });
              }}
              className={`${buttonClass} text-magenta`}
            >
              Удалить
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setReporting((v) => !v)}
          aria-expanded={reporting}
          className={buttonClass}
        >
          Пожаловаться
        </button>
      </div>

      {reporting ? (
        <form
          role="dialog"
          aria-label="Жалоба на место"
          className="mt-3 space-y-2 rounded-2xl border border-glass-brd bg-bg-1 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await reportTravelMapPlace(id, reason.trim());
              setReporting(false);
              setReason("");
              setNotice("Спасибо, жалоба отправлена администрации.");
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-text-2">
            Что не так с этим местом
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0 disabled:opacity-60"
            >
              Отправить
            </button>
            <button
              type="button"
              onClick={() => setReporting(false)}
              className={buttonClass}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
