import type { MediaTrack } from './media-parse';

/**
 * Состояние плеера Медиатеки (VED-331) — чистая часть, без `expo-audio`.
 *
 * Истина о том, играет ли звук, — у нативного плеера: его ставят на паузу
 * мимо нас кнопки экрана блокировки и наушников, отключение наушников,
 * входящий звонок через аудиофокус Android. Поэтому состояние не «решает»,
 * играет ли музыка, а следует снимкам нативного статуса (`native`). Своё
 * здесь — то, чего натив не знает: какая очередь, чего хотел человек и
 * кто прервал воспроизведение, чтобы вернуть его после звонка.
 *
 * Очередь — уже очередь, даже из одной записи (этап 1): `next`/`previous`
 * работают по индексу, этап 2 добавит только способы её наполнить.
 */

export type PlaybackStatus =
  /** Ничего не выбрано — мини-плеера нет. */
  | 'idle'
  /** Берём ссылку на звук и открываем поток. */
  | 'loading'
  /** Играли и ждём сеть. */
  | 'buffering'
  | 'playing'
  | 'paused'
  /** Дослушали до конца. */
  | 'ended'
  | 'error';

/**
 * Кто прервал воспроизведение. Возвращается музыка только после звонка:
 * голосовое и запись человек включил сам, и музыка, заигравшая следом без
 * спроса, мешала бы ему дослушать или договорить.
 */
export type InterruptReason = 'call' | 'ringtone' | 'voice' | 'recording';

export interface PlayerState {
  queue: MediaTrack[];
  index: number;
  status: PlaybackStatus;
  positionSec: number;
  durationSec: number;
  error: string | null;
  /** Пауза наша и вернуть звук надо, когда звонок закончится. */
  resumeAfterCall: boolean;
}

/** Снимок нативного статуса — ровно то, что приходит из `playbackStatusUpdate`. */
export interface NativeSnapshot {
  isLoaded: boolean;
  playing: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  error: string | null;
}

export type PlayerEvent =
  | { type: 'load'; queue: MediaTrack[]; index: number }
  | { type: 'native'; snapshot: NativeSnapshot }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionSec: number }
  | { type: 'interrupt'; reason: InterruptReason }
  | { type: 'call-ended' }
  | { type: 'fail'; message: string }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'stop' };

export const INITIAL_PLAYER_STATE: PlayerState = {
  queue: [],
  index: -1,
  status: 'idle',
  positionSec: 0,
  durationSec: 0,
  error: null,
  resumeAfterCall: false,
};

/** «Назад» в начале записи идёт к прошлой, дальше трёх секунд — к началу этой. */
export const RESTART_THRESHOLD_SEC = 3;

export function currentTrack(state: PlayerState): MediaTrack | null {
  return state.queue[state.index] ?? null;
}

export function hasNext(state: PlayerState): boolean {
  return state.index >= 0 && state.index < state.queue.length - 1;
}

export function hasPrevious(state: PlayerState): boolean {
  return state.index > 0;
}

/** Звук идёт или вот-вот пойдёт — кнопка показывает «Пауза». */
export function isActive(state: PlayerState): boolean {
  return state.status === 'playing' || state.status === 'buffering' || state.status === 'loading';
}

function finite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function atIndex(state: PlayerState, index: number): PlayerState {
  const track = state.queue[index];
  if (!track) return state;
  return {
    ...state,
    index,
    status: 'loading',
    positionSec: 0,
    durationSec: track.durationSeconds,
    error: null,
    resumeAfterCall: false,
  };
}

function fromNative(state: PlayerState, snapshot: NativeSnapshot): PlayerState {
  if (state.status === 'idle') return state;
  const duration = finite(snapshot.duration) || state.durationSec;
  const position = Math.min(finite(snapshot.currentTime), duration || Infinity);
  if (snapshot.error) {
    return { ...state, status: 'error', error: snapshot.error, positionSec: position || state.positionSec };
  }
  if (snapshot.didJustFinish) {
    return { ...state, status: 'ended', positionSec: duration, durationSec: duration, resumeAfterCall: false };
  }
  if (!snapshot.isLoaded) {
    // Поток ещё не открыт: пока грузим — «загрузка», а пауза и ошибка
    // остаются собой, иначе пустой снимок перед `replace` их стирал бы.
    return state.status === 'loading' ? { ...state, durationSec: duration } : state;
  }
  if (snapshot.playing) {
    // Играет — значит и после звонка возвращать нечего, даже если пауза
    // была наша: звук вернула система, получив фокус обратно.
    return {
      ...state,
      status: snapshot.isBuffering ? 'buffering' : 'playing',
      positionSec: position,
      durationSec: duration,
      error: null,
      resumeAfterCall: false,
    };
  }
  if (snapshot.isBuffering && state.status !== 'paused') {
    return { ...state, status: state.status === 'loading' ? 'loading' : 'buffering', positionSec: position, durationSec: duration };
  }
  // Загружено, не играет, не ждёт сеть. Пока мы только что запросили звук
  // (`loading`), это миг между «поток открыт» и «пошёл звук» — не пауза.
  if (state.status === 'loading' && position === 0) return { ...state, durationSec: duration };
  if (state.status === 'ended') return { ...state, durationSec: duration };
  return { ...state, status: 'paused', positionSec: position, durationSec: duration };
}

export function playerReducer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case 'load': {
      if (event.queue.length === 0) return state;
      const index = Math.min(Math.max(0, Math.floor(event.index)), event.queue.length - 1);
      return atIndex({ ...state, queue: event.queue }, index);
    }
    case 'native':
      return fromNative(state, event.snapshot);
    case 'play':
      if (state.status === 'idle') return state;
      // Дослушанное — с начала; ошибка — новая попытка той же записи.
      if (state.status === 'ended' || state.status === 'error') return atIndex(state, state.index);
      return { ...state, status: state.status === 'paused' ? 'buffering' : state.status, resumeAfterCall: false };
    case 'pause':
      if (state.status === 'idle' || state.status === 'ended' || state.status === 'error') return state;
      return { ...state, status: 'paused', resumeAfterCall: false };
    case 'seek': {
      if (state.status === 'idle') return state;
      const limit = state.durationSec > 0 ? state.durationSec : Infinity;
      const positionSec = Math.min(Math.max(0, event.positionSec), limit);
      return { ...state, positionSec, status: state.status === 'ended' ? 'paused' : state.status };
    }
    case 'interrupt': {
      if (!isActive(state)) return state;
      const fromCall = event.reason === 'call' || event.reason === 'ringtone';
      return { ...state, status: 'paused', resumeAfterCall: fromCall };
    }
    case 'call-ended':
      if (!state.resumeAfterCall) return state;
      return { ...state, status: 'buffering', resumeAfterCall: false };
    case 'fail':
      if (state.status === 'idle') return state;
      return { ...state, status: 'error', error: event.message, resumeAfterCall: false };
    case 'next':
      return hasNext(state) ? atIndex(state, state.index + 1) : state;
    case 'previous':
      if (state.status === 'idle') return state;
      if (state.positionSec > RESTART_THRESHOLD_SEC || !hasPrevious(state)) {
        return { ...state, positionSec: 0, status: state.status === 'ended' ? 'paused' : state.status };
      }
      return atIndex(state, state.index - 1);
    case 'stop':
      return INITIAL_PLAYER_STATE;
  }
}
