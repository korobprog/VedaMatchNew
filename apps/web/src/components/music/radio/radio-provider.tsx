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
  type MusicRadioItemDto,
  type MusicRadioStateDto,
} from "@vedamatch/shared";
import {
  fetchMusicRadio,
  leaveMusicRadio,
  musicRadioHeartbeat,
} from "@/lib/music-radio-client";
import { useMusicPlayer } from "../player/player-provider";
import {
  radioItemAt,
  radioMsLeft,
  radioOffsetSeconds,
  radioServerNow,
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
  start(): void;
  stop(): void;
  /** Узнать счётчик слушателей, не включая радио. */
  refreshListeners(): void;
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

/**
 * Плеер «Радио VM» (VED-437). Живёт рядом с плеером Медиатеки в корневом
 * layout: радио, как и музыка, переживает переход между разделами.
 *
 * Свой `<audio>`, а не очередь основного плеера: у эфира нет перемотки,
 * «назад» и очереди, а следующую запись выбирает сервер — одну на всех.
 * Два источника звука не играют разом: включили радио — плеер Медиатеки
 * встаёт на паузу; запустили запись в Медиатеке — радио выключается.
 *
 * Раз в 20 секунд плеер отмечается на сервере («слушаю») и получает свежий
 * эфир: если редакция поставила вставку «сейчас», слушатель переходит на
 * неё не позже чем через 20 секунд.
 */
export function MusicRadioProvider({ children }: { children: ReactNode }) {
  const player = useMusicPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<{ state: MusicRadioStateDto; at: number } | null>(
    null,
  );
  const slotRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `sync` и `load` зовут друг друга; ссылка разрывает круг зависимостей.
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const syncRef = useRef<(state: MusicRadioStateDto, at: number) => void>(
    () => undefined,
  );

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<MusicRadioItemDto | null>(null);
  const [listeners, setListeners] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      const element = new Audio();
      element.preload = "auto";
      audioRef.current = element;
    }
    return audioRef.current;
  }, []);

  const clearAdvance = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  /** Поставить в плеер то, что сейчас в эфире, с нужной секунды. */
  const sync = useCallback(
    (state: MusicRadioStateDto, receivedAt: number) => {
      stateRef.current = { state, at: receivedAt };
      setListeners(state.listeners);
      if (!activeRef.current) return;

      const now = radioServerNow(state, receivedAt, Date.now());
      const target = radioItemAt(state, now);
      clearAdvance();
      if (!target || !target.streamUrl) {
        // Эфир пуст или ответ устарел — спросим ещё раз чуть позже.
        setItem(null);
        advanceTimer.current = setTimeout(
          () => void loadRef.current(),
          RETRY_MS,
        );
        return;
      }

      setItem(target);
      const element = audio();
      if (slotRef.current !== target.slotId) {
        slotRef.current = target.slotId;
        element.src = target.streamUrl;
        const offset = radioOffsetSeconds(target, now);
        const seekAndPlay = () => {
          element.currentTime = offset;
          void element.play().catch(() => {
            setError("Браузер не дал включить звук — нажмите ещё раз");
            setActive(false);
            activeRef.current = false;
          });
        };
        if (element.readyState >= 1) seekAndPlay();
        else
          element.addEventListener("loadedmetadata", seekAndPlay, {
            once: true,
          });
      }
      // Переход к следующему — по эфиру, а не по `ended`: вставка могла
      // оборвать запись раньше конца файла.
      advanceTimer.current = setTimeout(
        () => {
          const cached = stateRef.current;
          if (!cached) return void loadRef.current();
          const later = radioServerNow(cached.state, cached.at, Date.now());
          // Следующее уже есть в последнем ответе — переходим без запроса.
          if (radioItemAt(cached.state, later)) {
            syncRef.current(cached.state, cached.at);
          } else void loadRef.current();
        },
        radioMsLeft(target, now) + 50,
      );
    },
    [audio],
  );

  const load = useCallback(async () => {
    try {
      const state = activeRef.current
        ? await musicRadioHeartbeat()
        : await fetchMusicRadio();
      setError(null);
      sync(state, Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Эфир недоступен");
      if (activeRef.current) {
        clearAdvance();
        advanceTimer.current = setTimeout(
          () => void loadRef.current(),
          RETRY_MS,
        );
      }
    } finally {
      setLoading(false);
    }
  }, [sync]);

  useEffect(() => {
    loadRef.current = load;
    syncRef.current = sync;
  }, [load, sync]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    slotRef.current = null;
    clearAdvance();
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    setActive(false);
    setItem(null);
    void leaveMusicRadio().catch(() => undefined);
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    // Разблокировать звук надо в том же нажатии: `play()` после сетевого
    // запроса браузер счёл бы запуском без участия человека.
    const element = audio();
    element.src = SILENCE;
    void element.play().catch(() => undefined);
    if (player?.isPlaying) player.toggle();
    activeRef.current = true;
    setActive(true);
    setLoading(true);
    setError(null);
    void loadRef.current();
  }, [audio, player]);

  const refreshListeners = useCallback(() => {
    if (activeRef.current) return;
    void fetchMusicRadio()
      .then((state) => setListeners(state.listeners))
      .catch(() => undefined);
  }, []);

  // Отметка «слушаю» и свежий эфир — пока радио включено.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => void loadRef.current(),
      MUSIC_RADIO_HEARTBEAT_MS,
    );
    return () => clearInterval(id);
  }, [active]);

  // Запустили запись в Медиатеке — радио уступает.
  const mainPlaying = Boolean(player?.isPlaying);
  useEffect(() => {
    if (mainPlaying && activeRef.current) stop();
  }, [mainPlaying, stop]);

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
      clearAdvance();
      audioRef.current?.pause();
    },
    [],
  );

  const api = useMemo<MusicRadioApi>(
    () => ({
      active,
      loading,
      item,
      listeners,
      error,
      start,
      stop,
      refreshListeners,
    }),
    [active, loading, item, listeners, error, start, stop, refreshListeners],
  );

  return <RadioContext.Provider value={api}>{children}</RadioContext.Provider>;
}
