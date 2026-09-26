/**
 * Чистые решения видеосекции одного соединения mesh'а (`group-peer-link.ts`).
 * Твин `apps/mobile/src/lib/group-calls/group-video-link.ts` — там же
 * полная история бага; здесь коротко, потому что сайт ломался так же.
 *
 * Симптом (26.09, два телефона, воспроизводится и с сайтом): у каждого своя
 * камера в плитке, плитка собеседника чёрная, звук идёт. Причин две:
 *
 * 1. **Приём.** Видеосекция заведена `addTransceiver("video")` без потока,
 *    и `ontrack` у собеседника приходит с пустым `event.streams`.
 *    Обработчик брал `streams[0]`, видео выбрасывал, а плитка получала
 *    поток звука. Теперь поток собирается из самих дорожек —
 *    `mergeRemoteTrack`.
 * 2. **Отдача у отвечающего.** По JSEP (5.10) удалённый offer
 *    присоединяется только к трансиверу из `addTrack`; заранее заведённый
 *    `addTransceiver` отвечающего в переговоры не попадал, браузер создавал
 *    для видеосекции новый трансивер `recvonly`, и камера отвечающего не
 *    уходила никуда. Теперь отвечающий берёт трансивер offer'а и открывает
 *    ему отдачу до answer'а — `pickVideoTransceiver`.
 */

export interface TrackLike {
  kind: string;
  id: string;
}

/**
 * Каким станет набор чужих дорожек пары после `ontrack`; `null` — ничего
 * не поменялось (повтор при перезапуске ICE). Сайт собирает и звук, и
 * картинку: `<audio>` и `<video>` играют из одного потока. Дорожка того же
 * вида с другим id заменяет прежнюю — видеосекция в паре одна.
 */
export function mergeRemoteTrack<T extends TrackLike>(
  current: readonly T[],
  track: T | null | undefined,
  kinds: readonly string[],
): T[] | null {
  if (!track || !kinds.includes(track.kind)) return null;
  if (current.some((known) => known.id === track.id)) return null;
  return [...current.filter((known) => known.kind !== track.kind), track];
}

export interface TransceiverLike {
  kind: string | null | undefined;
  mid: string | null | undefined;
  stopped: boolean;
  direction: string | null | undefined;
}

export interface VideoTransceiverPick {
  index: number;
  /** Направление до answer'а; `null` — менять не нужно. */
  setDirection: "sendrecv" | null;
}

/**
 * Какой трансивер несёт видео пары у ОТВЕЧАЮЩЕГО — между
 * `setRemoteDescription(offer)` и `createAnswer`. Только согласованный
 * (`mid` есть), живой и видео: несогласованного нет в SDP, дорожка в нём
 * никуда не уйдёт.
 */
export function pickVideoTransceiver(
  transceivers: readonly TransceiverLike[],
): VideoTransceiverPick | null {
  const index = transceivers.findIndex(
    (t) => t.kind === "video" && Boolean(t.mid) && !t.stopped,
  );
  if (index === -1) return null;
  const direction = transceivers[index].direction;
  return {
    index,
    setDirection: direction === "sendrecv" ? null : "sendrecv",
  };
}
