import Link from "next/link";
import {
  TRAVEL_MAP_TOUR_STATUS_LABELS,
  type TravelMapTourDto,
} from "@vedamatch/shared";
import {
  formatTourWhen,
  tourPaymentLabel,
  tourSeatsLabel,
} from "./tour-format";

/** Карточка набора для списков и блока «Ближайшие наборы» на маршруте. */
export function TourCard({
  tour,
  showRoute = true,
}: {
  tour: TravelMapTourDto;
  showRoute?: boolean;
}) {
  return (
    <li className="rounded-2xl border border-glass-brd bg-glass p-3">
      <p className="font-display text-base text-text-0">
        <Link href={`/travel/map/tours/${tour.id}`} className="underline">
          {tour.title || tour.routeName}
        </Link>
      </p>
      <p className="text-sm text-text-1">
        <span className="sr-only">Когда: </span>
        {formatTourWhen(tour.startsAt, tour.timezone)}
      </p>
      {showRoute ? (
        <p className="text-xs text-text-2">
          Маршрут:{" "}
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
        </p>
      ) : null}
      <p className="text-xs text-text-2">
        Встречаемся: {tour.meetingPoint}
      </p>
      <p className="text-xs text-text-2">
        Гид: {tour.guide.name}
        {tour.guide.isAgent ? " · ИИ" : ""}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-1">
        <span>{tourPaymentLabel(tour.payment, tour.priceMinor, tour.currency)}</span>
        <span>{tourSeatsLabel(tour.capacity, tour.participantsCount)}</span>
        <span>{TRAVEL_MAP_TOUR_STATUS_LABELS[tour.status]}</span>
        {tour.joined ? <span className="text-text-0">Вы записаны</span> : null}
      </p>
    </li>
  );
}
