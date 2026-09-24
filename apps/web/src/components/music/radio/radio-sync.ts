import type { MusicRadioItemDto, MusicRadioStateDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Синхронизация плеера радио с эфиром (VED-437) — чистая часть.
 *
 * Эфир один на всех: сервер отдаёт, что звучит и с какого момента, и своё
 * время. Часы устройства могут врать на минуты, поэтому позиция считается
 * от серверного времени плюс сколько прошло на устройстве с ответа.
 */

/** Серверное «сейчас» в мс по ответу и времени устройства. */
export function radioServerNow(
  state: Pick<MusicRadioStateDto, "serverTime">,
  receivedAtLocalMs: number,
  nowLocalMs: number,
): number {
  return (
    new Date(state.serverTime).getTime() +
    Math.max(0, nowLocalMs - receivedAtLocalMs)
  );
}

/** С какой секунды входить в элемент эфира; не меньше нуля. */
export function radioOffsetSeconds(
  item: Pick<MusicRadioItemDto, "startsAt" | "durationMs">,
  serverNowMs: number,
): number {
  const offsetMs = serverNowMs - new Date(item.startsAt).getTime();
  return Math.max(0, Math.min(item.durationMs, offsetMs)) / 1000;
}

/**
 * Что должно звучать в `serverNowMs`: текущее из ответа, а если оно уже
 * отзвучало (ответ пришёл давно) — следующее. `null` — ответ устарел
 * целиком, нужен новый.
 */
export function radioItemAt(
  state: Pick<MusicRadioStateDto, "current" | "next">,
  serverNowMs: number,
): MusicRadioItemDto | null {
  for (const item of [state.current, state.next]) {
    if (!item) continue;
    const start = new Date(item.startsAt).getTime();
    if (start <= serverNowMs && serverNowMs < start + item.durationMs) {
      return item;
    }
  }
  return null;
}

/** Через сколько мс кончится элемент — когда переходить к следующему. */
export function radioMsLeft(
  item: Pick<MusicRadioItemDto, "startsAt" | "durationMs">,
  serverNowMs: number,
): number {
  return Math.max(
    0,
    new Date(item.startsAt).getTime() + item.durationMs - serverNowMs,
  );
}

/** «12 слушают», «1 слушает». */
export function radioListenersLabel(count: number): string {
  return `${count} ${plural(count, "слушает", "слушают", "слушают")}`;
}

/** Подпись того, что в эфире: «Исполнитель — Название» или вставка. */
export function radioItemTitle(item: MusicRadioItemDto): string {
  if (item.kind === "insert") return item.insertTitle ?? "Голосовая вставка";
  const track = item.track;
  if (!track) return "Радио VM";
  return track.artist ? `${track.artist.name} — ${track.title}` : track.title;
}
