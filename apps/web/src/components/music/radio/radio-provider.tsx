"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MUSIC_RADIO_HEARTBEAT_MS,
  MUSIC_STREAM_URL_TTL_SECONDS,
  type MusicRadioItemDto,
  type MusicRadioStateDto,
} from "@vedamatch/shared";
import {
  fetchMusicRadio,
  leaveMusicRadio,
  musicRadioHeartbeat,
} from "@/lib/music-radio-client";
import { rememberStreamUrl } from "@/lib/music/stream-url-cache";
import {
  holdMediaSessionForRadio,
  releaseMediaSessionFromRadio,
} from "../player/media-session";
import { useMusicPlayer } from "../player/player-provider";
import { revealMusicPlayerCollapsed } from "../player/player-reveal";
import {
  radioHandoffPosition,
  radioHandoffTrackId,
  radioHandoffStep,
} from "./radio-handoff";
import {
  radioAfterEnd,
  radioMediaMetadata,
  radioNextAfter,
  radioOffsetSeconds,
  radioPlayFailure,
  radioServerNow,
  radioShouldPrefetch,
  radioSlotLeftMs,
  radioSyncPlan,
  type RadioEntry,
} from "./radio-sync";

export interface MusicRadioApi {
  /** Радио включено (играет или грузится). */
  active: boolean;
  loading: boolean;
  /** Что звучит в эфире сейчас. */
  item: MusicRadioItemDto | null;
  /** Сколько слушают; `null` — ещё не спрашивали. */
  listeners: number | null;
  error: string | null;
  /** Поставили на паузу с экрана блокировки, из наушников или звонком. */
  paused: boolean;
  start(): void;
  stop(): void;
  /** Снова в эфир после паузы — с той секунды, что звучит сейчас. */
  resume(): void;
  /** Узнать счётчик слушателей, не включая радио. */
  refreshListeners(): void;
  /**
   * Продолжить звучащую запись в плеере Медиатеки с той же секунды
   * (VED-542). Радио замолкает, когда плеер зазвучит сам, — не раньше.
   * Во вставке и в пустом эфире ничего не делает.
   */
  handoffToPlayer(): void;
}

const RadioContext = createContext<MusicRadioApi | null>(null);

export function useMusicRadio(): MusicRadioApi | null {
  return useContext(RadioContext);
}

/**
 * Четверть секунды тишины (WAV, 8 кГц, 8 бит): ею плеер «разблокируется»
 * в самом нажатии, пока эфир ещё грузится, — Safari иначе не даст играть.
 */
const SILENCE = (() => {
  const samples = 2000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return `data:audio/wav;base64,${btoa(binary)}`;
})();

/** Сколько ждать перед повтором, если эфир не ответил, мс. */
const RETRY_MS = 5_000;

function mediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Кнопки системной карточки для эфира: без перемотки и «назад». */
function applyRadioMediaHandlers(
  handlers: { play(): void; pause(): void; stop(): void } | null,
): void {
  if (!mediaSessionSupported()) return;
  const set = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Браузер может не знать конкретное действие — остальные встанут.
    }
  };
  set("play", handlers ? () => handlers.play() : null);
  set("pause", handlers ? () => handlers.pause() : null);
  set("stop", handlers ? () => handlers.stop() : null);
  for (const action of [
    "nexttrack",
    "previoustrack",
    "seekbackward",
    "seekforward",
    "seekto",
  ] as MediaSessionAction[]) {
    set(action, null);
  }
}

function applyRadioPlaybackState(state: MediaSessionPlaybackState): void {
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.playbackState = state;
}

/**
 * Плеер «Радио VM» (VED-437). Живёт рядом с плеером Медиатеки в корневом
 * layout: радио, как и музыка, переживает переход между разделами.
 *
 * Свой `<audio>`, а не очередь основного плеера: у эфира нет перемотки,
 * «назад» и очереди, а следующую запись выбирает сервер — одну на всех.
 * Два источника звука не играют разом: включили радио — плеер Медиатеки
 * встаёт на паузу; запустили запись в Медиатеке — радио выключается.
 *
 * Переход к следующей записи (VED-543) — по `ended` и `timeupdate` того же
 * `<audio>`, в том же обработчике, по ссылке из последнего ответа эфира.
 * Прежде переход ждал `setTimeout` до конца записи, а с погашенным экраном
 * Android таймеры вкладки троттлит и замораживает: запись кончалась,
 * наступала тишина, и радио замолкало насовсем. Ссылку на следующую запись
 * плеер получает заранее — отметка «слушаю» раз в 20 секунд и внеочередной
 * запрос за полминуты до конца, если следующей в ответе ещё нет. Если
 * ссылки всё же нет, `<audio>` крутит тишину, пока она не придёт: смолкший
 * элемент браузер вправе усыпить.
 *
 * Раз в 20 секунд плеер отмечается на сервере («слушаю») и получает свежий
 * эфир: если редакция поставила вставку «сейчас», слушатель переходит на
 * неё не позже чем через 20 секунд. Вернулись на вкладку — эфир
 * спрашивается сразу, и отставший плеер догоняет его.
 *
 * Системная карточка (Media Session) на время эфира — радио: название,
 * обложка, «пауза», «играть» и «стоп» с экрана блокировки.
 */
export function MusicRadioProvider({ children }: { children: ReactNode }) {
  const player = useMusicPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<{ state: MusicRadioStateDto; at: number } | null>(
    null,
  );
  /** Что сейчас стоит в `<audio>` (или отзвучало последним, пока тишина). */
  const playingRef = useRef<MusicRadioItemDto | null>(null);
  /** В `<audio>` крутится тишина: ждём ссылку на следующую запись. */
  const bridgingRef = useRef(false);
  /** Когда элементу назначили ссылку эфира — от этого считается её срок. */
  const srcAssignedAtRef = useRef(0);
  const activeRef = useRef(false);
  /** Идёт переход в плеер Медиатеки (VED-542), см. `radioHandoffStep`. */
  const handoffRef = useRef(false);
  const pausedRef = useRef(false);
  /** `play()` не пустили на скрытой вкладке — повторить, когда вернутся. */
  const resumeOnVisibleRef = useRef(false);
  const lastFetchRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `apply`, `load` и `stop` зовут друг друга; ссылки разрывают круг.
  const loadRef = useRef<(realign?: boolean) => Promise<void>>(
    async () => undefined,
  );
  const stopRef = useRef<() => void>(() => undefined);

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [item, setItem] = useState<MusicRadioItemDto | null>(null);
  const [listeners, setListeners] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  /** Повтор запроса, когда эфир не ответил или пуст. Переход им не делается. */
  const scheduleRetry = useCallback(() => {
    clearRetry();
    retryTimer.current = setTimeout(() => void loadRef.current(), RETRY_MS);
  }, [clearRetry]);

  const playSafely = useCallback((element: HTMLAudioElement) => {
    void Promise.resolve(element.play()).catch((cause: unknown) => {
      const hidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";
      const verdict = radioPlayFailure(cause, hidden);
      if (verdict === "resume-later") resumeOnVisibleRef.current = true;
      if (verdict === "stop") {
        stopRef.current();
        setError("Браузер не дал включить звук — нажмите ещё раз");
      }
    });
  }, []);

  /** Поставить запись эфира в тот же `<audio>` и сразу играть. */
  const enter = useCallback(
    (entry: RadioEntry) => {
      const element = audioRef.current;
      if (!element || !entry.item.streamUrl) return;
      const slotId = entry.item.slotId;
      bridgingRef.current = false;
      playingRef.current = entry.item;
      setItem(entry.item);
      element.loop = false;
      element.src = entry.item.streamUrl;
      srcAssignedAtRef.current = Date.now();
      if (entry.offset > 0) {
        element.addEventListener(
          "loadedmetadata",
          () => {
            if (playingRef.current?.slotId === slotId) {
              element.currentTime = entry.offset;
            }
          },
          { once: true },
        );
      }
      // `play()` — здесь же, без ожидания метаданных и сети: вызов внутри
      // `ended` звучащего элемента браузер пускает и на скрытой вкладке.
      playSafely(element);
    },
    [playSafely],
  );

  /** Ссылки на следующую нет — тишина в цикле, пока не придёт ответ эфира. */
  const bridge = useCallback(() => {
    const element = audioRef.current;
    if (!element) return;
    bridgingRef.current = true;
    element.loop = true;
    element.src = SILENCE;
    playSafely(element);
  }, [playSafely]);

  /** Свежий ответ эфира: догнать его, если нужно. */
  const apply = useCallback(
    (state: MusicRadioStateDto, receivedAt: number, realign: boolean) => {
      stateRef.current = { state, at: receivedAt };
      setListeners(state.listeners);
      if (!activeRef.current || pausedRef.current) return;
      const element = audioRef.current;
      if (!element) return;
      const now = radioServerNow(state, receivedAt, Date.now());
      const playing = playingRef.current;

      if (bridgingRef.current) {
        let entry: RadioEntry | null = null;
        if (playing) entry = radioAfterEnd(state, playing, now);
        else {
          const plan = radioSyncPlan(state, null, now, false);
          if (plan.kind === "switch") entry = plan;
        }
        if (entry) {
          clearRetry();
          enter(entry);
        } else {
          if (!playing) setItem(null);
          scheduleRetry();
        }
        return;
      }

      const plan = radioSyncPlan(
        state,
        playing
          ? { item: playing, positionSeconds: element.currentTime }
          : null,
        now,
        realign,
      );
      if (plan.kind === "switch") {
        clearRetry();
        enter(plan);
      } else if (plan.kind === "seek") {
        element.currentTime = plan.offset;
      } else if (plan.kind === "wait") {
        setItem(null);
        scheduleRetry();
      }
    },
    [clearRetry, enter, scheduleRetry],
  );

  const load = useCallback(
    async (realign = false) => {
      lastFetchRef.current = Date.now();
      try {
        const state =
          activeRef.current && !pausedRef.current
            ? await musicRadioHeartbeat()
            : await fetchMusicRadio();
        setError(null);
        apply(state, Date.now(), realign);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Эфир недоступен");
        if (activeRef.current) scheduleRetry();
      } finally {
        setLoading(false);
      }
    },
    [apply, scheduleRetry],
  );

  /** Запись кончилась (`ended`) или вышел её слот: следующая — сразу. */
  const advance = useCallback(() => {
    const playing = playingRef.current;
    if (!activeRef.current || bridgingRef.current || !playing) return;
    const cached = stateRef.current;
    const entry = cached
      ? radioAfterEnd(
          cached.state,
          playing,
          radioServerNow(cached.state, cached.at, Date.now()),
        )
      : null;
    if (entry) {
      enter(entry);
      // Следующая пошла; заодно освежить эфир, чтобы знать, что после неё.
      if (!cached || !radioNextAfter(cached.state, entry.item)) {
        void loadRef.current();
      }
      return;
    }
    bridge();
    void loadRef.current();
  }, [bridge, enter]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      const element = new Audio();
      element.preload = "auto";
      element.addEventListener("ended", () => {
        if (!bridgingRef.current) advance();
      });
      element.addEventListener("timeupdate", () => {
        const playing = playingRef.current;
        if (!activeRef.current || bridgingRef.current || !playing) return;
        const left = radioSlotLeftMs(playing, element.currentTime);
        // Вставка редакции могла укоротить слот — обрываем по эфиру.
        if (left <= 0) return advance();
        if (
          radioShouldPrefetch(
            stateRef.current?.state ?? null,
            playing,
            left,
            Date.now() - lastFetchRef.current,
          )
        ) {
          void loadRef.current();
        }
      });
      element.addEventListener("play", () => {
        if (!activeRef.current) return;
        applyRadioPlaybackState("playing");
        if (pausedRef.current) {
          pausedRef.current = false;
          setPaused(false);
          // Звук стоял — эфир ушёл вперёд: догнать.
          void loadRef.current(true);
        }
      });
      element.addEventListener("pause", () => {
        // Конец файла тоже присылает `pause` — это не пауза человека.
        if (!activeRef.current || element.ended) return;
        pausedRef.current = true;
        setPaused(true);
        applyRadioPlaybackState("paused");
      });
      audioRef.current = element;
    }
    return audioRef.current;
  }, [advance]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    handoffRef.current = false;
    pausedRef.current = false;
    bridgingRef.current = false;
    resumeOnVisibleRef.current = false;
    playingRef.current = null;
    clearRetry();
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.loop = false;
      element.removeAttribute("src");
      element.load();
    }
    applyRadioMediaHandlers(null);
    releaseMediaSessionFromRadio();
    setActive(false);
    setPaused(false);
    setItem(null);
    void leaveMusicRadio().catch(() => undefined);
  }, [clearRetry]);

  const resume = useCallback(() => {
    const element = audioRef.current;
    if (!activeRef.current || !element) return;
    resumeOnVisibleRef.current = false;
    // `play` у элемента снимет паузу и догонит эфир.
    playSafely(element);
  }, [playSafely]);

  const pause = useCallback(() => {
    if (activeRef.current) audioRef.current?.pause();
  }, []);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    // Разблокировать звук надо в том же нажатии: `play()` после сетевого
    // запроса браузер счёл бы запуском без участия человека. Тишина
    // крутится, пока эфир не ответит.
    const element = audio();
    holdMediaSessionForRadio();
    activeRef.current = true;
    handoffRef.current = false;
    pausedRef.current = false;
    playingRef.current = null;
    bridgingRef.current = true;
    element.loop = true;
    element.src = SILENCE;
    void Promise.resolve(element.play()).catch(() => undefined);
    if (player?.isPlaying) player.toggle();
    applyRadioMediaHandlers({ play: resume, pause, stop });
    setActive(true);
    setPaused(false);
    setLoading(true);
    setError(null);
    void loadRef.current();
  }, [audio, player, resume, pause, stop]);

  const refreshListeners = useCallback(() => {
    if (activeRef.current) return;
    void fetchMusicRadio()
      .then((state) => setListeners(state.listeners))
      .catch(() => undefined);
  }, []);

  // Отметка «слушаю» и свежий эфир — пока радио включено. Переход между
  // записями на этот интервал не опирается.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => void loadRef.current(),
      MUSIC_RADIO_HEARTBEAT_MS,
    );
    return () => clearInterval(id);
  }, [active]);

  // Карточка на экране блокировки: что звучит в эфире.
  useEffect(() => {
    if (!active || !mediaSessionSupported()) return;
    if (typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata(
        radioMediaMetadata(item),
      );
    }
    // У эфира нет перемотки: ползунок основного плеера здесь лишний.
    try {
      navigator.mediaSession.setPositionState?.();
    } catch {
      // Не поддерживается — карточка останется без ползунка, как и надо.
    }
  }, [active, item]);

  // Вернулись на вкладку — спросить эфир сразу и догнать, если отстали;
  // звук, который браузер не пустил в фоне, запустить снова.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !activeRef.current) return;
      const element = audioRef.current;
      if (resumeOnVisibleRef.current && element) {
        resumeOnVisibleRef.current = false;
        playSafely(element);
      }
      void loadRef.current(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [playSafely]);

  /*
   * Переход в плеер (VED-542). Звук у плеера и радио в разных `<audio>`,
   * поэтому шов прячется перекрытием: плеер запускается с секунды, которую
   * сейчас слышно в эфире, а радио играет, пока плеер не зазвучит (см.
   * эффект ниже). Ссылку эфира плеер получает готовой через запас адресов:
   * это та же подписанная ссылка на тот же файл, и без неё первый звук
   * ждал бы лишний круг — запрос к порталу и редирект.
   *
   * Системную карточку всё это время держит радио (VED-543): эффекты
   * плеера её не трогают, пока радио не выключится в `stop()` — тогда
   * плеер выставляет свою запись и кнопки заново.
   */
  const handoffToPlayer = useCallback(() => {
    if (!activeRef.current || handoffRef.current || !player) return;
    const trackId = radioHandoffTrackId(item);
    if (!item || !trackId) return;
    const element = audioRef.current;
    // В `<audio>` именно эта запись, а не тишина между записями.
    const inElement =
      !bridgingRef.current && playingRef.current?.slotId === item.slotId;
    const cached = stateRef.current;
    const air = cached
      ? radioOffsetSeconds(
          item,
          radioServerNow(cached.state, cached.at, Date.now()),
        )
      : 0;
    const position = radioHandoffPosition(
      item,
      element && inElement ? element.currentTime : null,
      air,
    );
    if (item.streamUrl && inElement) {
      rememberStreamUrl(
        trackId,
        element?.currentSrc || item.streamUrl,
        MUSIC_STREAM_URL_TTL_SECONDS,
        srcAssignedAtRef.current,
      );
    }
    handoffRef.current = true;
    player.play(trackId, [trackId], position);
  }, [item, player]);

  // Запустили запись в Медиатеке — радио уступает. Кроме перехода в
  // плеер: там плеер «играет» раньше, чем зазвучал, — см. эффект ниже.
  const mainPlaying = Boolean(player?.isPlaying);
  useEffect(() => {
    if (mainPlaying && activeRef.current && !handoffRef.current) stop();
  }, [mainPlaying, stop]);

  const mainLoading = Boolean(player?.isLoading);
  const mainError = player?.loadError ?? null;
  useEffect(() => {
    if (!activeRef.current || !handoffRef.current) return;
    const step = radioHandoffStep({
      isPlaying: mainPlaying,
      isLoading: mainLoading,
      loadError: mainError,
    });
    if (step === "cancel") handoffRef.current = false;
    if (step !== "finish") return;
    stop();
    // Полоса плеера встаёт на место полосы эфира — свёрнутой, как по
    // горячей кнопке «Плеер», даже если её прятали в пузырь или паузой.
    revealMusicPlayerCollapsed();
  }, [mainPlaying, mainLoading, mainError, stop]);

  // Закрыли вкладку — уходим из счётчика сразу.
  useEffect(() => {
    const onHide = () => {
      if (activeRef.current) void leaveMusicRadio().catch(() => undefined);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  useEffect(
    () => () => {
      clearRetry();
      audioRef.current?.pause();
      if (activeRef.current) {
        applyRadioMediaHandlers(null);
        releaseMediaSessionFromRadio();
      }
    },
    [clearRetry],
  );

  const api = useMemo<MusicRadioApi>(
    () => ({
      active,
      loading,
      item,
      listeners,
      error,
      paused,
      start,
      stop,
      resume,
      refreshListeners,
      handoffToPlayer,
    }),
    [
      active,
      loading,
      item,
      listeners,
      error,
      paused,
      start,
      stop,
      resume,
      refreshListeners,
      handoffToPlayer,
    ],
  );

  return <RadioContext.Provider value={api}>{children}</RadioContext.Provider>;
}
