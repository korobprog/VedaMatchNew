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
