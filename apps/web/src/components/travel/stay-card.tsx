import Link from "next/link";
import {
  TRAVEL_STAY_KIND_LABELS,
  type TravelStayCardDto,
} from "@vedamatch/shared";
import { priceLabel } from "./price";

/** Карточка объекта в списке. */
export function StayCard({ stay }: { stay: TravelStayCardDto }) {
  return (
    <li className="rounded-2xl border border-glass-brd bg-glass p-4">
      <Link href={`/travel/stays/${stay.id}`} className="block">
        <p className="text-xs uppercase tracking-wide text-text-2">
          {TRAVEL_STAY_KIND_LABELS[stay.kind]}
          {stay.placeName ? ` · ${stay.placeName}` : ""}
        </p>
        <p className="mt-1 font-display text-lg text-text-0">{stay.name}</p>
        {stay.address ? (
          <p className="mt-1 text-sm text-text-2">{stay.address}</p>
        ) : null}
        <p className="mt-2 text-sm text-text-1">
          {priceLabel(stay.priceMinor, stay.currency, stay.payment)}
        </p>
      </Link>
    </li>
  );
}
