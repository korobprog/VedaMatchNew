import type { TravelGuestColor, TravelGuestDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Цвет гостя — классы на токенах темы. Полные строки классов, а не сборка
 * из кусков: Tailwind находит классы в исходнике по целому слову.
 */
export const GUEST_BORDER_CLASS: Record<TravelGuestColor, string> = {
  none: "border-glass-brd",
  magenta: "border-magenta",
  cyan: "border-cyan",
  gold: "border-gold",
  violet: "border-violet",
  blue: "border-blue",
};

export const GUEST_SWATCH_CLASS: Record<TravelGuestColor, string> = {
  none: "bg-transparent border border-glass-brd",
  magenta: "bg-magenta",
  cyan: "bg-cyan",
  gold: "bg-gold",
  violet: "bg-violet",
  blue: "bg-blue",
};

const dayMonth = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** «19 мая» из `YYYY-MM-DD`. */
export function shortDate(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

export function nightsLabel(nights: number): string {
  return `${nights} ${plural(nights, "сутки", "суток", "суток")}`;
}

/**
 * Строка состояния оплаты под именем гостя. Долг — первым: ради него на
 * ресепшене и открывают базу.
 */
export function guestPaymentLabel(
  guest: Pick<TravelGuestDto, "paidThrough" | "unpaidNights" | "living">,
): string {
  const parts: string[] = [];
  if (guest.unpaidNights > 0) {
    parts.push(`не оплачено ${nightsLabel(guest.unpaidNights)}`);
  }
  if (guest.paidThrough) {
    parts.push(`оплачено по ${shortDate(guest.paidThrough)}`);
  } else if (guest.living) {
    parts.push("оплат ещё не было");
  }
  return parts.join(" · ");
}

/** Поиск по базе: без регистра и без различия «е» и «ё». */
export function matchesGuest(
  guest: Pick<TravelGuestDto, "fullName" | "phone" | "keyLabel" | "roomLabel">,
  query: string,
): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е");
  const needle = normalize(query.trim());
  if (!needle) return true;
  return [guest.fullName, guest.phone, guest.keyLabel, guest.roomLabel ?? ""]
    .map(normalize)
    .some((field) => field.includes(needle));
}

/**
 * Подсказка суммы при оплате за сутки. Подставляется, только пока человек не
 * набрал сумму сам: переписывать введённое руками нельзя.
 */
export function suggestedAmountMinor(
  nights: number | null,
  nightPriceMinor: number | null,
): number | null {
  if (!nights || !nightPriceMinor) return null;
  return nights * nightPriceMinor;
}
