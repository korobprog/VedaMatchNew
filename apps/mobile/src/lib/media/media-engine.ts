import type { AudioOwner } from '@/lib/audio/audio-arbiter';
import type { MediaApi } from './media-api';
import { describeMediaError, PLAYBACK_FAILED } from './media-errors';
import type { MediaTrack, MediaStreamUrl } from './media-parse';
import { LOCK_SCREEN_OPTIONS, callTransition, lockScreenMetadata, type LockScreenMetadata } from './media-session';
import { HEARTBEAT_INTERVAL_SEC, clampPosition, isStreamUrlFresh, listenedBetween, skipBy } from './playback-math';
import {
  INITIAL_PLAYER_STATE,
  currentTrack,
  isActive,
  playerReducer,
  type InterruptReason,
  type NativeSnapshot,
  type PlayerEvent,
  type PlayerState,
} from './player-state';

/**
 * Движок плеера Медиатеки (VED-331): связывает чистое состояние
 * (`player-state.ts`) с нативным плеером `expo-audio`, сервером и остальным
 * звуком приложения. Отдельно от React и с внедрёнными зависимостями, чтобы
 * последовательности — «выбрал запись → взяли ссылку → пошёл звук → экран
 * блокировки», «зазвонил звонок → пауза → звонок кончился → звук вернулся»,
 * «ссылка протухла → взяли новую с той же секунды» — проверялись тестом без
 * телефона. Провайдер (`media-player-provider.tsx`) только подаёт сюда
 * настоящие `createAudioPlayer`, клиент API и фазу звонка.
 *
 * Один нативный плеер на всё приложение: следующая запись — `replace`, а
 * не второй плеер. Два плеера — два сеанса на экране блокировки и два
 * владельца одного звука.
 */

/** То, что движку нужно от `AudioPlayer` из `expo-audio`. */
export interface NativeMediaPlayer {
  replace(source: { uri: string }): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void> | void;
  setActiveForLockScreen(active: boolean, metadata?: LockScreenMetadata, options?: typeof LOCK_SCREEN_OPTIONS): void;
  addListener(event: 'playbackStatusUpdate', listener: (status: NativeSnapshot) => void): { remove(): void };
  remove(): void;
}

export interface MediaEngineDeps {
  createPlayer(): NativeMediaPlayer;
  api: Pick<MediaApi, 'streamUrl' | 'heartbeat' | 'stopListening'>;
  /** Полный режим воспроизведения (`lib/audio/app-audio-mode.ts`). */
  ensureAudioMode(): Promise<void>;
  /** Канал уведомления с русским названием — до первого показа шторки. */
  ensureChannel(): Promise<void>;
  announce(owner: AudioOwner): void;
  onYield(owner: AudioOwner, listener: (starter: AudioOwner) => void): () => void;
  now(): number;
}

interface CachedUrl extends MediaStreamUrl {
  trackId: string;
  fetchedAtMs: number;
}

export interface MediaEngine {
  getState(): PlayerState;
  /** Идёт звонок — «Играть» не включает звук, пока он не кончится. */
  isCallBusy(): boolean;
  subscribe(listener: () => void): () => void;
  /** Играть очередь с записи `index`. Этап 1 передаёт очередь из одной. */
  playQueue(queue: MediaTrack[], index?: number): Promise<void>;
  toggle(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seekTo(positionSec: number): void;
  skip(deltaSec: number): void;
  next(): Promise<void>;
  previous(): Promise<void>;
  /** Закрыть плеер: звук, мини-плеер и шторка уходят вместе. */
  stop(): void;
  /** Фаза звонка изменилась: занят ли звук разговором. */
  setCallBusy(busy: boolean): void;
  dispose(): void;
}

export function createMediaEngine(deps: MediaEngineDeps): MediaEngine {
  let state: PlayerState = INITIAL_PLAYER_STATE;
  const listeners = new Set<() => void>();
  let player: NativeMediaPlayer | null = null;
  let statusSubscription: { remove(): void } | null = null;
  let cachedUrl: CachedUrl | null = null;
  /** Номер загрузки: ответ на прошлый выбор записи не должен её перебить. */
  let loadToken = 0;
  /** Одна автоматическая попытка взять новую ссылку на загрузку. */
  let recoveredForToken = -1;
  let callBusy = false;
  let lastPosition: number | null = null;
  let listenedSec = 0;
  let lastBeatAtMs = 0;
  let wasPlaying = false;
  let lockScreenActive = false;

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  function dispatch(event: PlayerEvent) {
    const next = playerReducer(state, event);
    if (next === state) return;
    state = next;
    emit();
  }

  function ensurePlayer(): NativeMediaPlayer {
    if (player) return player;
    player = deps.createPlayer();
    statusSubscription = player.addListener('playbackStatusUpdate', onNativeStatus);
    return player;
  }

  function flushListening(stopped: boolean) {
    const track = currentTrack(state);
    if (!track) return;
    const seconds = Math.round(listenedSec);
    if (seconds > 0) {
      listenedSec -= seconds;
      lastBeatAtMs = deps.now();
      void deps.api
        .heartbeat({ trackId: track.id, positionSeconds: Math.floor(state.positionSec), listenedSeconds: seconds })
        .catch(() => undefined);
    }
    if (stopped) void deps.api.stopListening().catch(() => undefined);
  }

  function onNativeStatus(snapshot: NativeSnapshot) {
    if (state.status === 'idle') return;
    // Ошибка потока чаще всего — протухшая подписанная ссылка: пауза дольше
    // её жизни. Один раз берём свежую и продолжаем с той же секунды, и
    // только потом признаём ошибку.
    if (snapshot.error && recoveredForToken !== loadToken) {
      // Номер следующей загрузки: она и есть попытка восстановления, и её
      // собственная ошибка второй попытки уже не получит.
      recoveredForToken = loadToken + 1;
      cachedUrl = null;
      void loadCurrent(state.positionSec);
      return;
    }
    const playing = snapshot.playing && snapshot.isLoaded;
    listenedSec += listenedBetween(lastPosition, snapshot.currentTime, playing);
    lastPosition = Number.isFinite(snapshot.currentTime) ? snapshot.currentTime : lastPosition;
    dispatch({ type: 'native', snapshot: snapshot.error ? { ...snapshot, error: PLAYBACK_FAILED } : snapshot });
    if (playing && deps.now() - lastBeatAtMs >= HEARTBEAT_INTERVAL_SEC * 1000) flushListening(false);
    if (wasPlaying && !playing) flushListening(true);
    wasPlaying = playing;
  }

  async function streamUrlFor(track: MediaTrack): Promise<string> {
    const now = deps.now();
    if (
      cachedUrl &&
      cachedUrl.trackId === track.id &&
      isStreamUrlFresh(cachedUrl.fetchedAtMs, cachedUrl.expiresInSeconds, now)
    ) {
      return cachedUrl.url;
    }
    const fresh = await deps.api.streamUrl(track.id);
    cachedUrl = { ...fresh, trackId: track.id, fetchedAtMs: now };
    return fresh.url;
  }

  /** Открыть поток текущей записи и играть — с начала или с `fromSec`. */
  async function loadCurrent(fromSec = 0): Promise<void> {
    const track = currentTrack(state);
    if (!track) return;
    const token = ++loadToken;
    // Молчать просим сразу, ещё до сети: голосовое не должно доигрывать,
    // пока грузится ссылка на лекцию.
    deps.announce('media');
    try {
      await deps.ensureAudioMode();
      await deps.ensureChannel().catch(() => undefined);
      const url = await streamUrlFor(track);
      if (token !== loadToken || currentTrack(state)?.id !== track.id) return;
      const native = ensurePlayer();
      lastPosition = null;
      lastBeatAtMs = deps.now();
      native.replace({ uri: url });
      if (fromSec > 0) await native.seekTo(fromSec);
      if (token !== loadToken) return;
      native.play();
      native.setActiveForLockScreen(true, lockScreenMetadata(track), LOCK_SCREEN_OPTIONS);
      lockScreenActive = true;
    } catch (error) {
      if (token !== loadToken) return;
      dispatch({ type: 'fail', message: describeMediaError(error, 'Не удалось включить запись. Повторите.') });
    }
  }

  async function resume(): Promise<void> {
    if (!player || !cachedUrl || !isStreamUrlFresh(cachedUrl.fetchedAtMs, cachedUrl.expiresInSeconds, deps.now())) {
      await loadCurrent(state.positionSec);
      return;
    }
    deps.announce('media');
    await deps.ensureAudioMode();
    player.play();
  }

  function pauseNative() {
    player?.pause();
  }

  const unsubscribeYield = deps.onYield('media', (starter) => {
    if (!isActive(state)) return;
    pauseNative();
    dispatch({ type: 'interrupt', reason: starter as InterruptReason });
  });

  const engine: MediaEngine = {
    getState: () => state,
    isCallBusy: () => callBusy,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async playQueue(queue, index = 0) {
      if (queue.length === 0) return;
      const sameTrack = currentTrack(state)?.id === queue[index]?.id && state.status !== 'error';
      if (sameTrack && state.status !== 'ended') {
        // Нажали на то, что уже выбрано, — это «играть/пауза», а не «с начала».
        await engine.toggle();
        return;
      }
      flushListening(false);
      dispatch({ type: 'load', queue, index });
      await loadCurrent();
    },
    async toggle() {
      if (isActive(state)) engine.pause();
      else await engine.play();
    },
    async play() {
      if (state.status === 'idle') return;
      if (callBusy) return;
      const restart = state.status === 'ended' || state.status === 'error';
      dispatch({ type: 'play' });
      if (restart) {
        recoveredForToken = -1;
        await loadCurrent();
      } else {
        await resume();
      }
    },
    pause() {
      pauseNative();
      dispatch({ type: 'pause' });
    },
    seekTo(positionSec) {
      if (state.status === 'idle') return;
      const target = clampPosition(positionSec, state.durationSec);
      lastPosition = target;
      dispatch({ type: 'seek', positionSec: target });
      void player?.seekTo(target);
    },
    skip(deltaSec) {
      engine.seekTo(skipBy(state.positionSec, deltaSec, state.durationSec));
    },
    async next() {
      const before = state.index;
      dispatch({ type: 'next' });
      if (state.index !== before) await loadCurrent();
    },
    async previous() {
      const before = state.index;
      dispatch({ type: 'previous' });
      if (state.index !== before) await loadCurrent();
      else void player?.seekTo(0);
    },
    stop() {
      loadToken += 1;
      pauseNative();
      flushListening(true);
      if (lockScreenActive) {
        player?.setActiveForLockScreen(false);
        lockScreenActive = false;
      }
      wasPlaying = false;
      dispatch({ type: 'stop' });
    },
    setCallBusy(busy) {
      const change = callTransition(callBusy, busy);
      callBusy = busy;
      if (change === 'started' && isActive(state)) {
        pauseNative();
        dispatch({ type: 'interrupt', reason: 'call' });
      } else if (change === 'ended' && state.resumeAfterCall) {
        dispatch({ type: 'call-ended' });
        void resume();
      }
    },
    dispose() {
      engine.stop();
      unsubscribeYield();
      statusSubscription?.remove();
      statusSubscription = null;
      player?.remove();
      player = null;
      listeners.clear();
    },
  };

  return engine;
}
