import type { MusicRadioItemDto, MusicRadioStateDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import {
  buildArtwork,
  buildMediaMetadata,
  type MediaSessionMetadata,
} from "../player/media-session";

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

/**
 * Переход между записями эфира (VED-543) — по событиям самого `<audio>`,
 * а не по таймеру. С погашенным экраном Android троттлит и замораживает
 * таймеры вкладки, а замолчавшую страницу через пару секунд перестаёт
 * считать звучащей: `setTimeout` до конца записи срабатывал поздно или
 * никогда, и радио замолкало. `ended` и `timeupdate` приходят от
 * медиаконвейера, пока звук идёт, поэтому следующая запись ставится в тот
 * же `<audio>` без паузы — по ссылке, полученной заранее.
 */

/** За сколько до конца записи ссылка на следующую обязана быть на руках. */
export const RADIO_PREFETCH_MS = 30_000;
/** Не чаще раза в столько спрашивать эфир ради следующей записи, мс. */
export const RADIO_PREFETCH_MIN_GAP_MS = 5_000;
/** Отставание от эфира, которое терпим без перемотки, секунды. */
export const RADIO_DRIFT_TOLERANCE_SECONDS = 8;
/** Вход в запись ближе к её началу, чем это, — просто с начала, секунды. */
export const RADIO_START_TOLERANCE_SECONDS = 2;

type RadioTiming = Pick<MusicRadioItemDto, "slotId" | "startsAt">;

function startMs(item: Pick<MusicRadioItemDto, "startsAt">): number {
  return new Date(item.startsAt).getTime();
}

/** Позиция входа: у самого начала — с нуля, чтобы не перематывать зря. */
function entryOffset(item: MusicRadioItemDto, serverNowMs: number): number {
  const offset = radioOffsetSeconds(item, serverNowMs);
  return offset < RADIO_START_TOLERANCE_SECONDS ? 0 : offset;
}

/**
 * Сколько мс осталось играть записи по часам самого `<audio>`: плеер вошёл
 * в неё с позиции эфира, поэтому секунда файла — это секунда слота.
 * Вставка редакции может укоротить слот раньше конца файла — тогда запись
 * обрывается по длительности слота, а не по `ended`.
 */
export function radioSlotLeftMs(
  item: Pick<MusicRadioItemDto, "durationMs">,
  currentTimeSeconds: number,
): number {
  return Math.max(0, item.durationMs - currentTimeSeconds * 1000);
}

/** Следующая запись эфира после играющей, с готовой ссылкой. */
export function radioNextAfter(
  state: Pick<MusicRadioStateDto, "current" | "next">,
  playing: RadioTiming,
): MusicRadioItemDto | null {
  for (const item of [state.current, state.next]) {
    if (!item?.streamUrl || item.slotId === playing.slotId) continue;
    if (startMs(item) > startMs(playing)) return item;
  }
  return null;
}

export interface RadioEntry {
  item: MusicRadioItemDto;
  /** С какой секунды файла входить. */
  offset: number;
}

/**
 * Что ставить, когда играющая запись кончилась (`ended` или слот вышел).
 * Если плеер отстал от эфира (звук стоял), — то, что в эфире сейчас, с
 * нужной секунды; иначе — следующая запись из последнего ответа, даже если
 * по расписанию она начнётся через миг: тишина до неё дала бы браузеру
 * повод усыпить вкладку. `null` — следующей ссылки нет, нужен запрос.
 */
export function radioAfterEnd(
  state: Pick<MusicRadioStateDto, "current" | "next">,
  playing: RadioTiming,
  serverNowMs: number,
): RadioEntry | null {
  const live = radioItemAt(state, serverNowMs);
  if (
    live?.streamUrl &&
    live.slotId !== playing.slotId &&
    startMs(live) > startMs(playing)
  ) {
    return { item: live, offset: entryOffset(live, serverNowMs) };
  }
  const next = radioNextAfter(state, playing);
  return next ? { item: next, offset: entryOffset(next, serverNowMs) } : null;
}

export type RadioSyncPlan =
  | { kind: "keep" }
  | { kind: "wait" }
  | { kind: "switch"; item: MusicRadioItemDto; offset: number }
  | { kind: "seek"; offset: number };

/**
 * Свежий ответ эфира: что делать с играющим.
 *
 * - ничего не играет или эфир ушёл вперёд (вставка «сейчас», звук стоял) —
 *   переключиться с нужной секунды;
 * - играет то же — оставить, а после возврата на вкладку или паузы
 *   (`realign`) догнать перемоткой, если отстали заметно;
 * - плеер впереди расписания (файл кончился раньше слота, и следующая
 *   запись пошла сразу) — оставить: назад эфир не отматывается;
 * - ответ пуст или устарел — `wait`, если играть нечего.
 */
export function radioSyncPlan(
  state: Pick<MusicRadioStateDto, "current" | "next">,
  playing: { item: RadioTiming; positionSeconds: number } | null,
  serverNowMs: number,
  realign: boolean,
): RadioSyncPlan {
  const target = radioItemAt(state, serverNowMs);
  if (!target?.streamUrl) return playing ? { kind: "keep" } : { kind: "wait" };
  if (!playing || startMs(target) > startMs(playing.item)) {
    return {
      kind: "switch",
      item: target,
      offset: entryOffset(target, serverNowMs),
    };
  }
  if (target.slotId !== playing.item.slotId) return { kind: "keep" };
  const offset = radioOffsetSeconds(target, serverNowMs);
  if (
    realign &&
    Math.abs(offset - playing.positionSeconds) > RADIO_DRIFT_TOLERANCE_SECONDS
  ) {
    return { kind: "seek", offset };
  }
  return { kind: "keep" };
}

/**
 * Пора ли спросить эфир заранее: запись подходит к концу, а ссылки на
 * следующую в последнем ответе нет. Спрашиваем не чаще раза в
 * `RADIO_PREFETCH_MIN_GAP_MS` — `timeupdate` приходит несколько раз в
 * секунду.
 */
export function radioShouldPrefetch(
  state: Pick<MusicRadioStateDto, "current" | "next"> | null,
  playing: RadioTiming,
  leftMs: number,
  sinceLastFetchMs: number,
): boolean {
  if (leftMs > RADIO_PREFETCH_MS) return false;
  if (sinceLastFetchMs < RADIO_PREFETCH_MIN_GAP_MS) return false;
  return !state || !radioNextAfter(state, playing);
}

export type RadioPlayFailure = "ignore" | "resume-later" | "stop";

/**
 * Отказ `play()`. `AbortError` — ссылку сменили раньше, чем звук пошёл:
 * это не ошибка. На скрытой вкладке браузер вправе не запустить звук без
 * нажатия — радио не выключаем, а запускаем снова, когда человек вернётся.
 * Выключаем только на видимой странице, где можно попросить нажать ещё раз.
 */
export function radioPlayFailure(
  error: unknown,
  hidden: boolean,
): RadioPlayFailure {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (name === "AbortError") return "ignore";
  return hidden ? "resume-later" : "stop";
}

/** Карточка эфира на экране блокировки: что звучит и что это радио. */
export function radioMediaMetadata(
  item: MusicRadioItemDto | null,
): MediaSessionMetadata {
  const track = item?.track ?? null;
  if (track) {
    return {
      ...buildMediaMetadata(track),
      album: "Радио VM",
    };
  }
  return {
    title: item ? radioItemTitle(item) : "Радио VM",
    artist: "Радио VM",
    album: "Радио VM",
    artwork: buildArtwork(null),
  };
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
