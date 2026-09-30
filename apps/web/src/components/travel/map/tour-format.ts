import {
  TRAVEL_CURRENCIES,
  TRAVEL_MAP_TOUR_PAYMENT_LABELS,
  type TravelCurrency,
  type TravelMapTourPayment,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { formatPrice } from "../price";

/** Зона годна для Intl, иначе `undefined` (браузерная). */
function safeZone(timezone: string | null | undefined): string | undefined {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: timezone });
    return timezone;
  } catch {
    return undefined;
  }
}

/**
 * «12 окт, 07:00 (Asia/Kolkata)». Время — в зоне места встречи: «в 7:00»
 * там, а не у смотрящего. Неверная зона не роняет страницу: берём браузерную
 * и зону в подписи не показываем.
 */
export function formatTourWhen(
  startsAt: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const zone = safeZone(timezone);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const month = get("month").replace(/\.$/, "");
  const text = `${get("day")} ${month}, ${get("hour")}:${get("minute")}`;
  return zone ? `${text} (${zone})` : text;
}

/** «5 из 20 мест» (свободно), «12 записались», «Мест нет». */
export function tourSeatsLabel(
  capacity: number | null,
  participantsCount: number,
): string {
  if (capacity === null) {
    return `${participantsCount} ${plural(participantsCount, "записался", "записались", "записались")}`;
  }
  const free = capacity - participantsCount;
  if (free <= 0) return "Мест нет";
  return `${free} из ${capacity} мест`;
}

/** «Бесплатно», «За служение», «За плату · 500 ₽». */
export function tourPaymentLabel(
  payment: TravelMapTourPayment,
  priceMinor: number | null,
  currency: string,
): string {
  const base = TRAVEL_MAP_TOUR_PAYMENT_LABELS[payment];
  if (payment !== "paid") return base;
  const safe = (TRAVEL_CURRENCIES as readonly string[]).includes(currency)
    ? (currency as TravelCurrency)
    : null;
  const price = safe ? formatPrice(priceMinor, safe) : null;
  return price ? `${base} · ${price}` : base;
}

/** Смещение зоны от UTC в минутах в заданный момент. */
function zoneOffsetMinutes(utcMs: number, zone: string | undefined): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** «2026-10-12T07:00» как стенное время в зоне → ISO (UTC). Пусто при ошибке. */
export function zonedLocalToIso(
  local: string,
  timezone: string | null | undefined,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return "";
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const zone = safeZone(timezone);
  // Два прохода: смещение зависит от самого момента (переход на летнее время).
  let utc = wall - zoneOffsetMinutes(wall, zone) * 60000;
  utc = wall - zoneOffsetMinutes(utc, zone) * 60000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** ISO → значение для `datetime-local` в зоне места встречи. */
export function isoToZonedLocal(
  iso: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const zone = safeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Ввод через запятую → чистый список без пустых и повторов, не длиннее max. */
export function parseCommaList(text: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
