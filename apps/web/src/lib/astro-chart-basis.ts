import { NAKSHATRA_NAMES } from "@vedamatch/shared";
import { formatDegrees } from "./astro-degrees";

/**
 * «На что посчитана карта» (VED-672): одинаковые, казалось бы, данные у двух
 * людей дали разные даши. Расчёт у своей карты и у записи астролога один и
 * тот же, значит, расходятся входные данные — и увидеть это можно, только
 * положив рядом время, часовой пояс, место и положение Луны, от которого
 * отсчитываются даши.
 */

/** Накшатра — 13°20′ дуги. */
const NAKSHATRA_SPAN = 360 / 27;

export interface ChartBasisSource {
  /** `YYYY-MM-DD` по месту рождения. */
  birthDate: string;
  /** `HH:mm`; null — время неизвестно. */
  birthTime: string | null;
  timezone: string;
  utcOffsetMinutes: number;
  place: { label: string };
}

export interface ChartBasis {
  /** «12.09.1984, 06:30» или «12.09.1984, время неизвестно». */
  local: string;
  /** «UTC+04:00, Europe/Moscow». */
  zone: string;
  place: string;
  /** «Рохини, 3°12′ из 13°20′» — сколько Луна прошла по накшатре. */
  moon: string;
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const rest = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${rest}`;
}

export function chartBasis(
  source: ChartBasisSource,
  moonLongitude: number,
): ChartBasis {
  const [year, month, day] = source.birthDate.split("-");
  const date = `${day}.${month}.${year}`;
  const longitude = ((moonLongitude % 360) + 360) % 360;
  const index = Math.min(26, Math.floor(longitude / NAKSHATRA_SPAN));
  const inside = longitude - index * NAKSHATRA_SPAN;
  return {
    local: `${date}, ${source.birthTime ?? "время неизвестно"}`,
    zone: `${formatUtcOffset(source.utcOffsetMinutes)}, ${source.timezone}`,
    place: source.place.label,
    moon: `${NAKSHATRA_NAMES[index]}, ${formatDegrees(inside)} из ${formatDegrees(NAKSHATRA_SPAN)}`,
  };
}
