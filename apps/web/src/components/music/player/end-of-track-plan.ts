import { nextIndex } from "@/lib/music-queue";
import { endOfTrackAction, type MusicPlaybackMode } from "./play-mode";

/**
 * Что делать, когда запись доиграла до конца (VED-283).
 *
 * Отдельным модулем и под тестом, потому что решение принимается в самый
 * неудобный момент: экран телефона погашен, вкладка в фоне, таймеры
 * придушены, перерисовки React может не случиться вовсе. Обработчик `ended`
 * обязан посчитать следующую запись **синхронно**, из того, что уже лежит в
 * памяти, и тут же назначить источник — иначе пауза между записями
 * растягивается, страница перестаёт считаться «звучащей», и браузер
 * замораживает её вместе с музыкой. Ровно так плеер и «проигрывал два трека
 * и выключался».
 *
 * Поэтому здесь нет ни `await`, ни обращения к сети, ни чтения состояния
 * React: только чистый расчёт по очереди, режиму и настройкам.
 */

/** Очередь больше не зацикливается (VED-132) — выбор всегда «вперёд до края». */
const REPEAT_OFF = "off" as const;

export interface EndOfTrackState {
  queue: readonly string[];
  /** Позиция доигравшей записи в исходной очереди. */
  index: number;
  shuffle: boolean;
  /** Перестановка позиций для shuffle; `null` — выключен. */
  order: number[] | null;
  mode: MusicPlaybackMode;
  /** Настройка «переходить к следующей записи» из `/music/settings`. */
  autoplay: boolean;
  /** Сон-таймер просил тишины после этой записи. */
  sleepStops: boolean;
}

/**
 * `stop` несёт причину: по ней плеер решает, гасить ли сон-таймер и снимать
 * ли строку «слушает сейчас». Без причины пришлось бы считать её второй раз
 * снаружи — и разойтись с тем, что решили здесь.
 */
export type EndOfTrackPlan =
  | { kind: "stop"; reason: "sleep" | "autoplay-off" | "mode-track" | "end" }
  | { kind: "next"; index: number; trackId: string }
  | { kind: "nextAlbum" };

export function planEndOfTrack(state: EndOfTrackState): EndOfTrackPlan {
  // Сон-таймер сильнее всего остального: человек просил тишины после этой
  // записи, и «следующая» здесь — прямое нарушение просьбы.
  if (state.sleepStops) return { kind: "stop", reason: "sleep" };
  if (!state.autoplay) return { kind: "stop", reason: "autoplay-off" };
  if (state.mode === "track") return { kind: "stop", reason: "mode-track" };

  const target = nextIndex({
    length: state.queue.length,
    index: state.index,
    repeat: REPEAT_OFF,
    shuffle: state.shuffle,
    order: state.order,
  });

  const action = endOfTrackAction({ mode: state.mode, hasNext: target !== null });
  if (action === "nextAlbum") return { kind: "nextAlbum" };

  // `target` может указывать на дырку в очереди: список правят прямо во
  // время игры (убрали запись, пришла новая очередь с сервера). Пустой
  // идентификатор лучше остановки молчанием не сделает — останавливаемся.
  const trackId = target === null ? undefined : state.queue[target];
  if (target === null || !trackId) return { kind: "stop", reason: "end" };

  return { kind: "next", index: target, trackId };
}

/**
 * Какая запись пойдёт следующей, если ничего не менять, — для прогрева
 * источника, пока играет текущая. Режим и настройки здесь не участвуют
 * намеренно: прогрев ничего не включает, и заготовленный впустую адрес
 * стоит одного лишнего запроса, а не тишины на переключении.
 */
export function upcomingTrackId(
  state: Pick<EndOfTrackState, "queue" | "index" | "shuffle" | "order">,
): string | null {
  const target = nextIndex({
    length: state.queue.length,
    index: state.index,
    repeat: REPEAT_OFF,
    shuffle: state.shuffle,
    order: state.order,
  });
  if (target === null) return null;
  return state.queue[target] ?? null;
}
