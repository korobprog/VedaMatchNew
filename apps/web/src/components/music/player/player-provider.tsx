"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { MusicRepeatMode, MusicTrackDto } from "@vedamatch/shared";
import {
  buildShuffleOrder,
  nextIndex as queueNext,
  prevIndex as queuePrev,
} from "@/lib/music-queue";
import {
  getPlaybackState,
  getTrack,
  savePlaybackPosition,
  sendHeartbeat,
  setTrackFavorite,
  stopPlayback,
  trackStreamUrl,
} from "@/lib/music-playback-api";
import {
  applyMediaHandlers,
  applyMediaMetadata,
  applyMediaPlaybackState,
  applyMediaPosition,
  clearMediaSession,
} from "./media-session";
import {
  PLAYER_RATE_MAX,
  PLAYER_RATE_MIN,
  PLAYER_STATE_VERSION,
  parsePlayerState,
  serializePlayerState,
} from "./player-state";

/**
 * Плеер портала. См. docs/music-service-plan.md, решение 6.
 *
 * Один `<audio>` на всё приложение, смонтированный в корневом layout: звук
 * обязан пережить переход между разделами, а компонент внутри `/music`
 * умирает на первом же клике в шапке.
 *
 * Состояние живёт в двух зеркалах. `localStorage` — ради мгновенного старта:
 * полоса показывает, что играло, ещё до ответа сервера. Сервер — ради
 * другого устройства: начал в метро с телефона, дослушал дома.
 */

const STORAGE_KEY = "vedamatch:music-player";

/** Тик плеера. Реже — теряется позиция, чаще — лишний шум в базе. */
const HEARTBEAT_MS = 30_000;

/** Шаг кнопок ±: лекции и киртаны длинные, пальцем по ползунку не попасть. */
export const SEEK_STEP_SECONDS = 15;

export interface MusicPlayerApi {
  current: MusicTrackDto | null;
  queue: string[];
  index: number;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  rate: number;
  volume: number;
  muted: boolean;
  isPrivateSession: boolean;
  isFavorite: boolean;
  /** Есть ли куда идти: полоса прячет кнопки, когда некуда. */
  hasNext: boolean;
  hasPrev: boolean;

  play(trackId: string, queue?: string[]): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  skip(delta: number): void;
  setRepeat(mode: MusicRepeatMode): void;
  toggleShuffle(): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  toggleMuted(): void;
  togglePrivateSession(): void;
  toggleFavorite(): void;
}

const MusicPlayerContext = createContext<MusicPlayerApi | null>(null);

/**
 * `null` вместо исключения: полоса и кнопки живут на страницах, которые
 * рендерятся и без провайдера — например в тестах компонентов. Падать из-за
 * плеера там, где плеер не нужен, неправильно.
 */
export function useMusicPlayer(): MusicPlayerApi | null {
  return useContext(MusicPlayerContext);
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<MusicTrackDto | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [repeat, setRepeatState] = useState<MusicRepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [rate, setRateState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isPrivateSession, setPrivateSession] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  /**
   * Позиция, с которой надо начать после загрузки записи. Применяется один
   * раз: иначе возобновление дёргало бы человека назад при каждой перемотке.
   */
  const resumeToRef = useRef<number | null>(null);
  /** Сколько прослушано с прошлого тика. Перемотка сюда не засчитывается. */
  const listenedRef = useRef(0);
  const lastTickPositionRef = useRef(0);

  const order = useMemo(
    () => (shuffle ? buildShuffleOrder(queue.length, shuffleSeed) : null),
    [shuffle, shuffleSeed, queue.length],
  );

  const hasNext =
    queueNext({ length: queue.length, index, repeat, shuffle, order }) !== null;
  const hasPrev =
    queuePrev({ length: queue.length, index, repeat, shuffle, order }) !== null;

  /**
   * Подгрузка карточки записи. Объявлена выше эффектов намеренно: они её
   * зовут, и объявление ниже по файлу работало бы только по счастливой
   * случайности — эффект успевает выполниться после присваивания.
   */
  const loadTrack = useCallback(async (trackId: string | null) => {
    if (!trackId) return;
    const track = await getTrack(trackId);
    if (track) setCurrent(track);
  }, []);

  // ---------- Зеркало в localStorage ----------

  /**
   * Читается один раз, на монтировании: до ответа сервера полоса уже знает,
   * что играло.
   *
   * Именно эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
   * и инициализатор вернул бы пустой плеер, а на клиенте — заполненный.
   * Это расхождение гидратации, оно хуже лишнего рендера. Тем же способом
   * читает своё значение `theme-provider`.
   */
  useEffect(() => {
    let stored = null;
    try {
      stored = parsePlayerState(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    if (!stored) return;

    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше:
       ленивый useState здесь даёт расхождение гидратации. */
    setQueue(stored.queue);
    setIndex(stored.index);
    setRepeatState(stored.repeat);
    setShuffle(stored.shuffle);
    setShuffleSeed(stored.shuffleSeed);
    setRateState(stored.rate);
    setVolumeState(stored.volume);
    resumeToRef.current = stored.positionSeconds;
    void loadTrack(stored.queue[stored.index] ?? null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Пустой список зависимостей намеренно: это чтение стартового состояния,
    // а не подписка на него.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queue.length === 0) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        serializePlayerState({
          version: PLAYER_STATE_VERSION,
          queue,
          index,
          positionSeconds,
          repeat,
          shuffle,
          shuffleSeed,
          rate,
          volume,
        }),
      );
    } catch {
      // Переполненное хранилище не должно ронять воспроизведение.
    }
  }, [queue, index, positionSeconds, repeat, shuffle, shuffleSeed, rate, volume]);

  // ---------- Возобновление с сервера ----------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await getPlaybackState();
      if (cancelled || !state?.trackId) return;
      // Локальное зеркало важнее: оно свежее и уже показано человеку.
      if (queue.length > 0) return;

      setQueue([state.trackId]);
      setIndex(0);
      resumeToRef.current = state.positionSeconds;
      await loadTrack(state.trackId);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Элемент audio ----------

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;

    audio.src = trackStreamUrl(current.id);
    audio.load();
    setPositionSeconds(0);
    lastTickPositionRef.current = 0;
    listenedRef.current = 0;
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate, current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [volume, muted]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDurationSeconds(
      Number.isFinite(audio.duration) ? Math.floor(audio.duration) : 0,
    );

    // Возобновление применяется ровно один раз на запись.
    const resumeTo = resumeToRef.current;
    resumeToRef.current = null;
    if (resumeTo && resumeTo > 0) {
      audio.currentTime = resumeTo;
      setPositionSeconds(resumeTo);
      lastTickPositionRef.current = resumeTo;
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const at = Math.floor(audio.currentTime);
    setPositionSeconds(at);

    // Прослушанным считается только естественный ход: перемотка на минуту
    // вперёд не должна засчитываться как минута прослушивания.
    const delta = at - lastTickPositionRef.current;
    if (delta > 0 && delta <= 2) listenedRef.current += delta;
    lastTickPositionRef.current = at;
  }, []);

  const next = useCallback(() => {
    const target = queueNext({
      length: queue.length,
      index,
      repeat,
      shuffle,
      order,
    });
    if (target === null) {
      setIsPlaying(false);
      return;
    }
    setIndex(target);
    void loadTrack(queue[target]);
  }, [queue, index, repeat, shuffle, order, loadTrack]);

  const prev = useCallback(() => {
    const target = queuePrev({
      length: queue.length,
      index,
      repeat,
      shuffle,
      order,
    });
    if (target === null) return;
    setIndex(target);
    void loadTrack(queue[target]);
  }, [queue, index, repeat, shuffle, order, loadTrack]);

  const handleEnded = useCallback(() => {
    // `repeat: one` возвращает ту же позицию — перезапускаем вручную, иначе
    // повтор одного трека не сработал бы вовсе.
    if (repeat === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    next();
  }, [repeat, next]);

  // ---------- Тик ----------

  useEffect(() => {
    if (!isPlaying || !current) return;

    const timer = window.setInterval(() => {
      const listened = listenedRef.current;
      listenedRef.current = 0;
      void sendHeartbeat({
        trackId: current.id,
        positionSeconds,
        listenedSeconds: listened,
        isPrivateSession,
      });
    }, HEARTBEAT_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying, current, positionSeconds, isPrivateSession]);

  // Уход со страницы: сохраняем позицию и снимаем «слушает сейчас». Иначе
  // человек «слушает» до протухания строки, хотя вкладку давно закрыл.
  useEffect(() => {
    const onHide = () => {
      if (!current) return;
      void savePlaybackPosition(current.id, positionSeconds);
      if (!isPlaying) void stopPlayback();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [current, positionSeconds, isPlaying]);

  // ---------- Media Session ----------

  // Карточка в системе: обложка и название на экране блокировки.
  useEffect(() => {
    if (!current) {
      clearMediaSession();
      return;
    }
    applyMediaMetadata(current);
  }, [current]);

  useEffect(() => {
    applyMediaPlaybackState(isPlaying);
  }, [isPlaying]);

  // Положение на дорожке: без него перемотка с экрана блокировки не работает,
  // а ползунок в системной карточке стоит на нуле.
  useEffect(() => {
    applyMediaPosition(positionSeconds, durationSeconds, rate);
  }, [positionSeconds, durationSeconds, rate]);

  // ---------- Команды ----------

  const play = useCallback(
    (trackId: string, nextQueue?: string[]) => {
      const list = nextQueue && nextQueue.length > 0 ? nextQueue : [trackId];
      const at = Math.max(0, list.indexOf(trackId));
      setQueue(list);
      setIndex(at);
      // Новая запись начинается с начала: возобновление — про возврат к
      // прежней, а не про «всегда с середины».
      resumeToRef.current = null;
      setIsPlaying(true);
      void loadTrack(trackId);
    },
    [loadTrack],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      void savePlaybackPosition(current.id, Math.floor(audio.currentTime));
      void stopPlayback();
    }
  }, [current]);

  // Запись сменилась и человек нажимал play — продолжаем сами.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current || !isPlaying) return;
    void audio.play().catch(() => {
      // Браузер может не дать автозапуск без жеста — это не ошибка.
      setIsPlaying(false);
    });
  }, [current, isPlaying]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const at = Math.max(0, Math.min(seconds, audio.duration || seconds));
    audio.currentTime = at;
    setPositionSeconds(Math.floor(at));
    lastTickPositionRef.current = Math.floor(at);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seek(audio.currentTime + delta);
    },
    [seek],
  );

  const toggleShuffle = useCallback(() => {
    setShuffle((was) => {
      // Новая перестановка на каждое включение: иначе «перемешать» второй раз
      // подряд даёт тот же порядок и выглядит сломанным.
      if (!was) setShuffleSeed(Math.floor(Math.random() * 0xffffffff) || 1);
      return !was;
    });
  }, []);

  const toggleFavorite = useCallback(() => {
    if (!current) return;
    const wanted = !isFavorite;
    setIsFavorite(wanted);
    void setTrackFavorite(current.id, wanted).then((result) => {
      // Сервер — источник истины: не прошло, возвращаем сердце как было.
      if (result) setIsFavorite(result.favorited);
      else setIsFavorite(!wanted);
    });
  }, [current, isFavorite]);

  /**
   * Кнопки системной карточки. Ставятся после объявления команд: система
   * запоминает обработчики и зовёт их, даже когда вкладка усыплена, поэтому
   * они обязаны ссылаться на актуальные функции.
   */
  useEffect(() => {
    const audio = audioRef.current;
    applyMediaHandlers(
      {
        play: () => {
          void audio?.play();
          setIsPlaying(true);
        },
        pause: () => {
          audio?.pause();
          setIsPlaying(false);
        },
        nextTrack: next,
        previousTrack: prev,
        seekTo: seek,
        seekBy: skip,
      },
      SEEK_STEP_SECONDS,
    );
  }, [next, prev, seek, skip]);

  const value = useMemo<MusicPlayerApi>(
    () => ({
      current,
      queue,
      index,
      isPlaying,
      positionSeconds,
      durationSeconds,
      repeat,
      shuffle,
      rate,
      volume,
      muted,
      isPrivateSession,
      isFavorite,
      hasNext,
      hasPrev,
      play,
      toggle,
      next,
      prev,
      seek,
      skip,
      setRepeat: setRepeatState,
      toggleShuffle,
      setRate: (value: number) =>
        setRateState(
          Math.min(PLAYER_RATE_MAX, Math.max(PLAYER_RATE_MIN, value)),
        ),
      setVolume: (value: number) =>
        setVolumeState(Math.min(1, Math.max(0, value))),
      toggleMuted: () => setMuted((was) => !was),
      togglePrivateSession: () => setPrivateSession((was) => !was),
      toggleFavorite,
    }),
    [
      current,
      queue,
      index,
      isPlaying,
      positionSeconds,
      durationSeconds,
      repeat,
      shuffle,
      rate,
      volume,
      muted,
      isPrivateSession,
      isFavorite,
      hasNext,
      hasPrev,
      play,
      toggle,
      next,
      prev,
      seek,
      skip,
      toggleShuffle,
      toggleFavorite,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      {/* Один элемент на всё приложение. `preload="none"` — открытие портала
          не должно тянуть мегабайты записи, которую никто не просил. */}
      <audio
        ref={audioRef}
        preload="none"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </MusicPlayerContext.Provider>
  );
}
