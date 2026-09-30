"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TRAVEL_MAP_TOUR_STATUS_LABELS,
  type TravelMapTourDto,
} from "@vedamatch/shared";
import {
  cancelTravelMapTour,
  completeTravelMapTour,
  getTravelMapTour,
  joinTravelMapTour,
  leaveTravelMapTour,
  openTravelMapTourGroup,
} from "@/lib/travel-map-api";
import {
  formatTourWhen,
  tourPaymentLabel,
  tourSeatsLabel,
} from "./tour-format";

const buttonClass =
  "rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 disabled:opacity-60";
const primaryClass =
  "rounded-xl border border-magenta px-3 py-2 text-sm text-text-0 disabled:opacity-60";

export function TourView({ id }: { id: string }) {
  const router = useRouter();
  const [tour, setTour] = useState<TravelMapTourDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getTravelMapTour(id, controller.signal)
      .then(setTour)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
      });
    return () => controller.abort();
  }, [id]);

  async function run(action: () => Promise<TravelMapTourDto>) {
    setBusy(true);
    setError(null);
    try {
      setTour(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function openGroup() {
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await openTravelMapTourGroup(id);
      router.push(`/chat/${conversationId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось открыть группу");
      setBusy(false);
    }
  }

  if (error && !tour) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!tour) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  const title = tour.title || tour.routeName;
  const open = tour.status === "scheduled";
  const isGuide = tour.canManage;

  return (
    <article aria-label={title}>
      <Link href="/travel/map/tours" className="text-sm text-cyan underline">
        Все наборы
      </Link>

      <header className="mt-3">
        <p className="text-sm text-text-2">
          {TRAVEL_MAP_TOUR_STATUS_LABELS[tour.status]}
        </p>
        <h1 className="font-display text-3xl text-text-0">{title}</h1>
        <p className="mt-1 text-lg text-text-0">
          {formatTourWhen(tour.startsAt, tour.timezone)}
        </p>
      </header>

      <dl className="my-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-text-2">Маршрут</dt>
        <dd className="text-text-0">
          {tour.routeId ? (
            <Link
              href={`/travel/map/routes/${tour.routeId}`}
              className="text-cyan underline"
            >
              {tour.routeName}
            </Link>
          ) : (
            tour.routeName
          )}
          {tour.city ? ` · ${tour.city}` : ""}
        </dd>
        <dt className="text-text-2">Где встречаемся</dt>
        <dd className="whitespace-pre-line text-text-0">{tour.meetingPoint}</dd>
        <dt className="text-text-2">Гид</dt>
        <dd className="text-text-0">
          <Link
            href={`/chat/people/users/${encodeURIComponent(tour.guide.id)}`}
            className="text-cyan underline"
          >
            {tour.guide.name}
          </Link>
          {tour.guide.isAgent ? " · ИИ" : ""}
          {" · "}
          <Link
            href={`/travel/map/tours?guideId=${encodeURIComponent(tour.guide.id)}`}
            className="text-cyan underline"
          >
            Наборы гида
          </Link>
        </dd>
        <dt className="text-text-2">Оплата</dt>
        <dd className="text-text-0">
          {tourPaymentLabel(tour.payment, tour.priceMinor, tour.currency)}
        </dd>
        <dt className="text-text-2">Места</dt>
        <dd className="text-text-0">
          {tourSeatsLabel(tour.capacity, tour.participantsCount)}
        </dd>
      </dl>

      {tour.note ? (
        <p className="mb-4 whitespace-pre-line text-sm text-text-1">{tour.note}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {!isGuide && open ? (
          tour.joined ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => leaveTravelMapTour(id))}
              className={buttonClass}
            >
              Я записан — выйти
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => joinTravelMapTour(id))}
              className={primaryClass}
            >
              Записаться
            </button>
          )
        ) : null}

        {tour.chatConversationId && (tour.joined || isGuide) ? (
          <Link
            href={`/chat/${tour.chatConversationId}`}
            className={buttonClass}
          >
            Группа набора
          </Link>
        ) : null}

        {isGuide ? (
          <>
            {open ? (
              <Link
                href={`/travel/map/tours/${tour.id}/edit`}
                className={buttonClass}
              >
                Изменить
              </Link>
            ) : null}
            {!tour.chatConversationId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void openGroup()}
                className={buttonClass}
              >
                Открыть группу набора
              </button>
            ) : null}
            {open ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Отметить набор проведённым?")) {
                      void run(() => completeTravelMapTour(id));
                    }
                  }}
                  className={buttonClass}
                >
                  Отметить проведённой
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Отменить набор «${title}»? Записавшиеся увидят отмену.`,
                      )
                    ) {
                      void run(() => cancelTravelMapTour(id));
                    }
                  }}
                  className={buttonClass}
                >
                  Отменить набор
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {isGuide ? (
        <section aria-label="Участники">
          <h2 className="mb-2 font-display text-xl text-text-0">
            Участники ({tour.participants.length})
          </h2>
          {tour.participants.length === 0 ? (
            <p className="text-sm text-text-2">Пока никто не записался.</p>
          ) : (
            <ul className="space-y-1">
              {tour.participants.map((p) => (
                <li key={p.userId} className="text-sm text-text-0">
                  <Link
                    href={`/chat/people/users/${encodeURIComponent(p.userId)}`}
                    className="underline"
                  >
                    {p.name}
                  </Link>
                  {p.isAgent ? " · ИИ" : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </article>
  );
}
