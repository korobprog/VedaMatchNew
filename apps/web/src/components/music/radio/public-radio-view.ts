import { plural } from "@/lib/plural";

/**
 * Публичная страница радио (VED-645) — чистая часть: подписи и выбор
 * баннера. Плеер и запросы — в `public-radio.tsx`.
 */

/**
 * С какого числа слушателей показывать аватарки. Две-три аватарки говорят
 * «здесь пусто» громче, чем их отсутствие, — ниже порога только подпись.
 */
export const RADIO_AVATARS_MIN_LISTENERS = 3;

/** «Сейчас слушают 12 человек»; ноль — приглашение, а не «0 человек». */
export function radioListenersLabel(listeners: number): string {
  if (listeners <= 0) return "Включите эфир — вы будете первым слушателем";
  const verb = listeners === 1 ? "слушает" : "слушают";
  return `Сейчас ${verb} ${listeners} ${plural(listeners, "человек", "человека", "человек")}`;
}

/**
 * «Нитай, Радха и ещё 10 человек из 5 городов» — под счётчиком. Имена —
 * только тех, кто не скрыл себя, поэтому «ещё» считается от всех
 * слушателей. `null` — называть некого.
 */
export function radioListenersNote(
  names: string[],
  listeners: number,
  cities: number,
): string | null {
  if (names.length === 0 || listeners < RADIO_AVATARS_MIN_LISTENERS) {
    return null;
  }
  const rest = Math.max(0, listeners - names.length);
  const who =
    rest > 0
      ? `${names.join(", ")} и ещё ${rest} ${plural(rest, "человек", "человека", "человек")}`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`
        : names[0];
  const where =
    cities > 1
      ? ` из ${cities} ${plural(cities, "города", "городов", "городов")}`
      : "";
  return `${who}${where}`;
}

export interface RadioAvatarStack {
  /** Фото в ряду внахлёст. */
  avatars: string[];
  /** Сколько слушателей не вошло в ряд — кружок «+N»; 0 — кружка нет. */
  rest: number;
}

/**
 * Ряд аватарок «нас много». `null` — слушателей меньше порога или фото ни
 * у кого нет: тогда остаётся одна подпись.
 */
export function radioAvatarStack(
  avatars: string[],
  listeners: number,
): RadioAvatarStack | null {
  if (listeners < RADIO_AVATARS_MIN_LISTENERS || avatars.length === 0) {
    return null;
  }
  const shown = avatars.slice(0, listeners);
  return { avatars: shown, rest: Math.max(0, listeners - shown.length) };
}

/**
 * Какой баннер рекламы показывать под записью: меняется вместе с записью и
 * одинаков у всех, кто слушает, — от идентификатора слота эфира.
 */
export function radioPromoIndex(slotId: string | null, count: number): number {
  if (count <= 0) return 0;
  if (!slotId) return 0;
  let hash = 0;
  for (let i = 0; i < slotId.length; i += 1) {
    hash = (hash * 31 + slotId.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

/** Доля отзвучавшего в записи эфира, 0…1 — полоса прогресса. */
export function radioProgress(
  item: { startsAt: string; durationMs: number } | null,
  serverNowMs: number,
): number {
  if (!item || item.durationMs <= 0) return 0;
  const done =
    (serverNowMs - new Date(item.startsAt).getTime()) / item.durationMs;
  return Math.min(1, Math.max(0, done));
}

/** «14:05» — время строки «Недавно в эфире» по часам гостя. */
export function radioClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
