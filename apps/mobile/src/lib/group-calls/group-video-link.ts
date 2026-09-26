/**
 * Чистые решения видеосекции одного соединения mesh'а (`group-peer-link.ts`).
 *
 * Выросло из бага «у каждого своя камера в плитке, а плитка собеседника
 * чёрная» (26.09, два телефона в «Конференции»). Звук шёл в обе стороны,
 * сервер место под видео выдал — ломалось в двух местах самого соединения,
 * и оба закрыты здесь правилами с тестами:
 *
 * 1. **Приём.** Пустая видеосекция заводится `addTransceiver('video')` без
 *    потока. У такой дорожки в SDP нет `msid`-потока, и у собеседника
 *    `ontrack` приходит с `event.streams = []`. Обработчик брал
 *    `event.streams[0]` и молча выбрасывал видеодорожку, а в плитку уходил
 *    поток ЗВУКА — `RTCView` без видеодорожки и есть чёрный прямоугольник.
 *    Звонок один на один этого не знает: там `addTrack(track, stream)`, и
 *    дорожка к потоку привязана. Теперь картинку собираем из самой
 *    дорожки (`event.track`), а поток события нам не нужен вовсе —
 *    `mergeRemoteTrack`.
 *
 * 2. **Отдача у отвечающего.** По JSEP (5.10) удалённый offer
 *    присоединяется только к трансиверу, заведённому `addTrack`. Трансивер
 *    из `addTransceiver`, который отвечающий заводил себе заранее, в
 *    переговоры не попадал: для видеосекции offer'а libwebrtc создавал
 *    НОВЫЙ трансивер с направлением `recvonly`, answer уходил `recvonly`,
 *    и камера отвечающего крутилась в отправителе, которого нет в SDP.
 *    Теперь отвечающий своего не заводит, а берёт тот, что создал offer, и
 *    открывает ему отдачу до answer'а — `pickVideoTransceiver`.
 *
 * Отдельно от `group-peer-link.ts`, потому что тот — склейка вокруг
 * нативного модуля и в jest-expo не поднимается (тот же приём, что у
 * `webrtc-signal-guard.ts`).
 */

/** Дорожка глазами решения: только то, по чему решаем. */
export interface TrackLike {
  kind: string;
  id: string;
}

/**
 * Каким станет набор чужих дорожек этой пары после `ontrack`.
 *
 * `null` — ничего не поменялось, пересобирать поток и перерисовывать
 * плитку не нужно. Так бывает часто: `ontrack` повторяется на ту же
 * дорожку при каждом перезапуске ICE (новый offer с теми же секциями).
 *
 * `kinds` — какие дорожки вообще собираем. Телефону для плитки нужна
 * только картинка: звук WebRTC на Android играет сам, без привязки к
 * потоку. Сайт собирает и звук — его `<audio>` играет из того же потока.
 *
 * Дорожка того же вида, но с другим id, ЗАМЕНЯЕТ прежнюю, а не
 * добавляется второй: в паре одна видеосекция, и две видеодорожки в одном
 * потоке значили бы, что `RTCView` выберет первую — то есть старую.
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

/** Трансивер глазами решения. */
export interface TransceiverLike {
  /** Вид дорожки приёмника — у трансивера он один на всю жизнь. */
  kind: string | null | undefined;
  /** `null` — секция ещё не согласована. */
  mid: string | null | undefined;
  stopped: boolean;
  direction: string | null | undefined;
}

export interface VideoTransceiverPick {
  index: number;
  /**
   * Какое направление выставить до answer'а, `null` — менять не нужно.
   * Созданный из offer'а трансивер рождается `recvonly`: с ним answer
   * говорит собеседнику «я только смотрю», и наша камера не уйдёт, даже
   * когда дорожка в отправителе есть.
   */
  setDirection: 'sendrecv' | null;
}

/**
 * Какой трансивер несёт видео этой пары у ОТВЕЧАЮЩЕГО — вызывается сразу
 * после `setRemoteDescription(offer)` и до `createAnswer`.
 *
 * Берём согласованный (`mid` есть), живой и видео. Несогласованный —
 * заведомо не тот: его нет в SDP, дорожка в нём никуда не уйдёт. Ровно
 * так ломалось до починки, поэтому такой трансивер здесь не выбирается,
 * даже если он единственный видео.
 */
export function pickVideoTransceiver(
  transceivers: readonly TransceiverLike[],
): VideoTransceiverPick | null {
  const index = transceivers.findIndex(
    (t) => t.kind === 'video' && Boolean(t.mid) && !t.stopped,
  );
  if (index === -1) return null;
  const direction = transceivers[index].direction;
  return {
    index,
    setDirection: direction === 'sendrecv' ? null : 'sendrecv',
  };
}

// ---------- диагностика ----------

/** Запись `getStats()` — поля, которые нужны сводке. */
export interface VideoStatsEntry {
  type?: string;
  kind?: string;
  mediaType?: string;
  framesEncoded?: number;
  framesSent?: number;
  framesReceived?: number;
  framesDecoded?: number;
  frameWidth?: number;
  frameHeight?: number;
  codecId?: string;
  mimeType?: string;
  id?: string;
}

export interface VideoFlow {
  /** Кадров кодером (исходящее) или декодером (входящее). */
  frames: number;
  /** `640x480`, `null` — размера ещё нет. */
  size: string | null;
  /** `VP8`, `H264`…; `null` — кодек не согласован. */
  codec: string | null;
}

export interface VideoStatsDigest {
  outbound: VideoFlow | null;
  inbound: VideoFlow | null;
}

/**
 * Сводка видео по `getStats()` одной пары: уходят ли наши кадры и
 * приходят ли чужие. Именно это отличает «дорожка не согласована» (нет
 * записи вовсе) от «согласована, но кадров нет» (камера собеседника не
 * снимает или кодек не сошёлся) — два разных бага с одинаковой чёрной
 * плиткой.
 *
 * `kind` в статистике старых libwebrtc называется `mediaType` — читаем оба.
 */
export function videoStatsDigest(entries: Iterable<VideoStatsEntry>): VideoStatsDigest {
  const list = [...entries];
  const codecs = new Map<string, string>();
  for (const entry of list)
    if (entry?.type === 'codec' && entry.id && entry.mimeType)
      codecs.set(entry.id, entry.mimeType.replace(/^video\//i, ''));

  const flow = (entry: VideoStatsEntry, frames: number | undefined): VideoFlow => ({
    frames: frames ?? 0,
    size:
      entry.frameWidth && entry.frameHeight
        ? `${entry.frameWidth}x${entry.frameHeight}`
        : null,
    codec: (entry.codecId && codecs.get(entry.codecId)) || null,
  });

  let outbound: VideoFlow | null = null;
  let inbound: VideoFlow | null = null;
  for (const entry of list) {
    const kind = entry?.kind ?? entry?.mediaType;
    if (kind !== 'video') continue;
    if (entry.type === 'outbound-rtp' && !outbound)
      outbound = flow(entry, entry.framesEncoded ?? entry.framesSent);
    if (entry.type === 'inbound-rtp' && !inbound)
      inbound = flow(entry, entry.framesDecoded ?? entry.framesReceived);
  }
  return { outbound, inbound };
}

/** Всё, что пара знает о своём видео, — для скрытой сводки на экране звонка. */
export interface PeerVideoDiagnostics {
  initiator: boolean;
  connectionState: string;
  /** Согласованная видеосекция: `mid` и направление, `null` — её нет. */
  transceiver: { mid: string | null; direction: string | null; current: string | null } | null;
  /** В нашем отправителе есть дорожка камеры. */
  sendingTrack: boolean;
  /** Чужая видеодорожка доехала (`ontrack`). */
  remoteTrack: boolean;
  stats: VideoStatsDigest;
}

/**
 * Сводка словами. Люди в ней — «собеседник 1, 2…», без имён и id:
 * сводку фотографируют с экрана и пересылают, персональному в ней не место.
 */
export function formatVideoDiagnostics(peers: readonly PeerVideoDiagnostics[]): string {
  if (peers.length === 0) return 'Соединений с собеседниками нет.';
  return peers
    .map((peer, i) => {
      const t = peer.transceiver;
      const section = t
        ? `mid ${t.mid ?? '—'}, ${t.direction ?? '—'} / ${t.current ?? '—'}`
        : 'не согласована';
      return [
        `Собеседник ${i + 1} (${peer.initiator ? 'offer наш' : 'offer его'}), связь ${peer.connectionState}`,
        `  видеосекция: ${section}`,
        `  отдаём: ${peer.sendingTrack ? 'камера в отправителе' : 'дорожки нет'}; ${flowLabel(peer.stats.outbound)}`,
        `  принимаем: ${peer.remoteTrack ? 'дорожка пришла' : 'дорожки нет'}; ${flowLabel(peer.stats.inbound)}`,
      ].join('\n');
    })
    .join('\n\n');
}

function flowLabel(flow: VideoFlow | null): string {
  if (!flow) return 'статистики нет';
  const parts = [`кадров ${flow.frames}`];
  if (flow.size) parts.push(flow.size);
  if (flow.codec) parts.push(flow.codec);
  return parts.join(', ');
}
