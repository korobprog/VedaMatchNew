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
  getMusicSettings,
  getPlaybackState,
  getTrack,
  savePlaybackPosition,
  sendHeartbeat,
  setTrackFavorite,
  stopPlayback,
  trackStreamUrl,
} from "@/lib/music-playback-api";
import { mediaErrorText } from "@/lib/music/media-error";
import { findSavedTrack } from "@/lib/music/offline-db";
import {
  SLEEP_TIMER_OFF,
  shouldStopNow,
  shouldStopOnEnded,
  type MusicSleepTimer,
} from "@/lib/music/sleep-timer";
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

/**
 * Отметка «полосу закрыли в этом браузере».
 *
 * Нужна, чтобы крестик пережил перезагрузку: без неё возобновление с сервера
 * поднимало полосу обратно на первой же открытой странице. Снимается сама,
 * как только человек что-нибудь запустил.
 */
const CLOSED_KEY = "vedamatch:music-player-closed";

function wasClosedHere(): boolean {
  try {
    return window.localStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberClosed(closed: boolean): void {
  try {
    if (closed) window.localStorage.setItem(CLOSED_KEY, "1");
    else window.localStorage.removeItem(CLOSED_KEY);
  } catch {
    // Приватный режим и запрет хранилища — не повод не работать.
  }
}

/** Тик плеера. Реже — теряется позиция, чаще — лишний шум в базе. */
const HEARTBEAT_MS = 30_000;

/** Шаг кнопок ±: лекции и киртаны длинные, пальцем по ползунку не попасть. */
export const SEEK_STEP_SECONDS = 15;

/**
 * Настройки прослушивания изменились в `/music/settings`.
 *
 * Событием, а не общим состоянием: форма настроек и плеер живут в разных
 * поддеревьях, и поднимать ради одного флажка провайдер над обоими значило бы
 * перерисовывать портал на каждый тик плеера. Переключатель обязан
 * действовать сразу — иначе человек снимает автопереход, дослушивает запись и
 * видит, что портал его не послушал.
 */
export const MUSIC_SETTINGS_CHANGED_EVENT = "vedamatch:music-settings-changed";

export interface MusicPlayerApi {
  current: MusicTrackDto | null;
  queue: string[];
  index: number;
  isPlaying: boolean;
  /**
   * Запись просили включить, а звука ещё нет: идём за подписанной ссылкой,
   * тянем начало файла, ждём буфер. На медленном канале это единственный
   * промежуток, когда человеку кажется, что нажатие не сработало.
   */
  isLoading: boolean;
  /**
   * Почему не заиграло. `null` — всё в порядке.
   *
   * Молчаливый отказ здесь стоит дороже всего: кнопка возвращается в
   * «слушать», и человек нажимает её снова и снова, считая, что промахнулся
   * пальцем. Так пришла жалоба «загрузил записи, они не воспроизводятся» —
   * без единого слова о причине ни у него, ни у нас.
   */
  loadError: string | null;
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

  /**
   * `resumeFrom` — начать не с нуля, а с этой секунды. Нужен там, где
   * позиция уже показана человеку («осталось 4:12» в карточке на главной):
   * без неё кнопка пуска противоречила бы собственной подписи.
   */
  play(trackId: string, queue?: string[], resumeFrom?: number): void;
  /** Поставить сразу за текущей записью. */
  playNext(trackId: string): void;
  /** Дописать в конец очереди. */
  addToQueue(trackId: string): void;
  /** Убрать из очереди по месту. Играющую запись не трогает. */
  removeFromQueue(at: number): void;
  /** Очистить очередь, оставив то, что звучит. */
  clearQueue(): void;
  /** Остановить и убрать полосу совсем. Позиция сохраняется. */
  close(): void;
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
  /** Чьё офлайн-хранилище открыто; `null` — вне портала. */
  offlineUserId: string | null;
  sleepTimer: MusicSleepTimer;
  setSleepTimer(timer: MusicSleepTimer): void;
  /** Сообщить плееру, чьё офлайн-хранилище использовать. */
  setOfflineUserId(userId: string | null): void;
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [repeat, setRepeatState] = useState<MusicRepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [rate, setRateState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isPrivateSession, setPrivateSession] = useState(false);
  /**
   * Чьё офлайн-хранилище открывать. Приходит из портального layout, где
   * человек уже известен: тянуть профиль в корневой layout ради одного
   * идентификатора значит добавить запрос к каждой странице, включая
   * лендинг. Пусто — офлайна нет, играем из сети.
   */
  const [offlineUserId, setOfflineUserIdState] = useState<string | null>(null);
  /**
   * То же значение в ref — и это не дублирование ради удобства.
   *
   * Эффект ниже присваивает `audio.src` и зовёт `load()`, а `load()` сбрасывает
   * воспроизведение в начало. Если этот эффект зависит от идентификатора,
   * любой его перещёлк останавливает музыку — а он щёлкает на каждом уходе со
   * страницы портала: идентификатор приходит из портального layout, и тот
   * размонтируется, когда человек открывает страницу вне группы `(portal)`.
   * Через ref эффект читает актуальное значение, но не перезапускается от
   * него.
   */
  const offlineUserIdRef = useRef<string | null>(null);
  const setOfflineUserId = useCallback((next: string | null) => {
    offlineUserIdRef.current = next;
    setOfflineUserIdState(next);
  }, []);
  /**
   * Сон-таймер. В localStorage не зеркалим намеренно: «выключить через
   * тридцать минут» — про этот вечер, и восстанавливать его через сутки при
   * открытии вкладки значит остановить музыку без спроса.
   */
  const [sleepTimer, setSleepTimer] = useState<MusicSleepTimer>(SLEEP_TIMER_OFF);
  const [isFavorite, setIsFavorite] = useState(false);
  /**
   * Идти ли к следующей записи, когда текущая кончилась.
   *
   * `true` до ответа сервера — это значение по умолчанию, и совпадать оно
   * обязано с `DEFAULT_SETTINGS` на стороне API: иначе первая же запись,
   * дослушанная до ответа, повела бы себя не так, как обещает форма настроек.
   */
  const [autoplay, setAutoplay] = useState(true);

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
      // Человек закрыл полосу — не поднимаем её обратно перезагрузкой.
      // Возобновление с сервера нужно для другого устройства, а не для того,
      // чтобы отменять только что нажатый крестик. Запись при этом не
      // потеряна: карточка «Продолжить» на главной читает то же состояние
      // сервера напрямую и вернёт её с той же секунды.
      if (wasClosedHere()) return;

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

  // ---------- Настройки прослушивания ----------

  /**
   * Читаем на монтировании и перечитываем, когда форма настроек сообщила о
   * сохранении. Гостю запрос вернёт `null` — остаётся значение по умолчанию.
   */
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getMusicSettings().then((settings) => {
        if (cancelled) return;
        setAutoplay(settings?.autoplay ?? true);
      });
    };

    load();
    window.addEventListener(MUSIC_SETTINGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(MUSIC_SETTINGS_CHANGED_EVENT, load);
    };
  }, []);

  // ---------- Элемент audio ----------

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    // Сначала своё, потом сеть. Локальный блоб выигрывает не только в
    // самолёте: по нему браузер перематывает сам, без похода за подписанной
    // ссылкой и без диапазонных запросов к S3.
    const play = async () => {
      let src = trackStreamUrl(current.id);
      const savedFor = offlineUserIdRef.current;
      if (savedFor) {
        try {
          const saved = await findSavedTrack(savedFor, current.id);
          if (saved) {
            objectUrl = URL.createObjectURL(saved.body);
            src = objectUrl;
          }
        } catch {
          // Хранилище недоступно (приватный режим, запрет) — идём в сеть.
        }
      }
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      audio.src = src;
      audio.load();
    };

    void play();
    setPositionSeconds(0);
    lastTickPositionRef.current = 0;
    listenedRef.current = 0;

    return () => {
      cancelled = true;
      // Ссылку на блоб обязательно отзываем: иначе каждая смена записи
      // оставляет в памяти вкладки копию файла на сотню мегабайт.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Зависимость только от записи. Идентификатор читается из ref намеренно:
    // см. комментарий к `offlineUserIdRef` — иначе музыка обрывается при
    // каждом переходе между сервисами.
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

  /**
   * Срабатывание сон-таймера. Проверяем секундами, а не одним `setTimeout` на
   * тридцать минут: вкладку усыпляют, таймеры в фоне растягивают, и заснувший
   * таймер разбудил бы человека музыкой вместо тишины.
   */
  useEffect(() => {
    if (sleepTimer.mode !== "at") return;
    const tick = () => {
      if (!shouldStopNow(sleepTimer, Date.now())) return;
      audioRef.current?.pause();
      setIsPlaying(false);
      setSleepTimer(SLEEP_TIMER_OFF);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sleepTimer]);

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

    // Сон-таймер сильнее автоперехода: человек просил тишины после этой
    // записи, и «следующая» здесь — прямое нарушение просьбы.
    if (shouldStopOnEnded(sleepTimer, Date.now())) {
      setIsPlaying(false);
      setSleepTimer(SLEEP_TIMER_OFF);
      if (current) void savePlaybackPosition(current.id, positionSeconds);
      void stopPlayback();
      return;
    }

    // Человек снял автопереход в настройках: останавливаемся на дослушанной
    // записи, а не уходим к следующей. Строку «слушает сейчас» снимаем сразу
    // — иначе друзья видели бы запись, которая давно кончилась.
    if (!autoplay) {
      setIsPlaying(false);
      if (current) void savePlaybackPosition(current.id, positionSeconds);
      void stopPlayback();
      return;
    }

    next();
  }, [repeat, autoplay, current, positionSeconds, next, sleepTimer]);

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
    (trackId: string, nextQueue?: string[], resumeFrom?: number) => {
      // Запустили — значит полоса снова нужна, и прежний крестик забыт.
      rememberClosed(false);

      const list = nextQueue && nextQueue.length > 0 ? nextQueue : [trackId];
      const at = Math.max(0, list.indexOf(trackId));
      setQueue(list);
      setIndex(at);
      // Новая запись начинается с начала: возобновление — про возврат к
      // прежней, а не про «всегда с середины». Исключение — когда зовущий
      // сам показал позицию и обещал её человеку: так делает карточка
      // «Продолжить» на главной, где под названием написано, сколько
      // осталось. Начать там с нуля значит соврать подписью.
      resumeToRef.current =
        resumeFrom !== undefined && resumeFrom > 0 ? resumeFrom : null;
      setIsPlaying(true);
      // Ждём с этой секунды, а не с первого `waiting` у элемента: до того
      // как появится `src`, элемент вообще не знает, что его о чём-то
      // просили, и кнопка успевала простоять безответной секунду и больше.
      setIsLoading(true);
      setLoadError(null);
      void loadTrack(trackId);
    },
    [loadTrack],
  );

  /**
   * «Слушать дальше» — сразу за текущей записью, не трогая остальное.
   *
   * Запись, уже стоящую в очереди, переносим, а не дублируем: два одинаковых
   * пункта в списке человек читает как сбой, а `repeat: one` на дубле ведёт
   * себя необъяснимо.
   */
  const playNext = useCallback(
    (trackId: string) => {
      setQueue((was) => {
        const at = was.indexOf(trackId);
        const without = at < 0 ? was : was.filter((_, i) => i !== at);
        // Индекс текущей записи мог сдвинуться, если убрали то, что стояло
        // выше неё: считаем место вставки уже по укороченному списку.
        const currentAt = current ? without.indexOf(current.id) : -1;
        const insertAt = currentAt < 0 ? without.length : currentAt + 1;
        return [
          ...without.slice(0, insertAt),
          trackId,
          ...without.slice(insertAt),
        ];
      });
    },
    [current],
  );

  /** «В конец очереди». Уже стоящую в ней запись не двигаем. */
  const addToQueue = useCallback((trackId: string) => {
    setQueue((was) => (was.includes(trackId) ? was : [...was, trackId]));
  }, []);

  /**
   * Убрать из очереди. Играющую запись не трогаем: убрать её значит оборвать
   * звук, а человек просил прибраться в списке, а не выключить музыку.
   */
  const removeFromQueue = useCallback(
    (at: number) => {
      setQueue((was) => {
        if (at < 0 || at >= was.length) return was;
        if (was[at] === current?.id) return was;
        return was.filter((_, i) => i !== at);
      });
      // Указатель на текущую запись сдвигается вместе со списком, иначе
      // «дальше» уводит не туда после первой же уборки.
      setIndex((was) => (at < was ? was - 1 : was));
    },
    [current],
  );

  /**
   * Закрыть плеер: остановить и убрать полосу совсем.
   *
   * Позицию сохраняем перед остановкой — закрытая запись не теряется,
   * карточка «Продолжить» на главной вернёт её с той же секунды. Поэтому
   * случайное закрытие не стоит человеку ничего.
   *
   * Зеркало в `localStorage` стираем: иначе следующее открытие портала
   * подняло бы полосу обратно, хотя человек её убрал.
   */
  const close = useCallback(() => {
    const audio = audioRef.current;
    audio?.pause();

    if (current) void savePlaybackPosition(current.id, positionSeconds);
    void stopPlayback();

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Запрет хранилища не повод не закрыться.
    }
    rememberClosed(true);

    setIsPlaying(false);
    setIsLoading(false);
    setCurrent(null);
    setQueue([]);
    setIndex(0);
    setPositionSeconds(0);
  }, [current, positionSeconds]);

  /** Очистить очередь, оставив то, что звучит. */
  const clearQueue = useCallback(() => {
    if (!current) {
      setQueue([]);
      setIndex(0);
      return;
    }
    setQueue([current.id]);
    setIndex(0);
  }, [current]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
      // Готовому буферу вертушка не нужна: мигание на возобновлении паузы
      // читается как сбой, а не как загрузка.
      if (audio.readyState < audio.HAVE_FUTURE_DATA) setIsLoading(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      setIsLoading(false);
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
      isLoading,
      loadError,
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
      playNext,
      addToQueue,
      removeFromQueue,
      clearQueue,
      close,
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
      offlineUserId,
      setOfflineUserId,
      sleepTimer,
      setSleepTimer,
      toggleFavorite,
    }),
    [
      current,
      queue,
      index,
      isPlaying,
      isLoading,
      loadError,
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
      playNext,
      addToQueue,
      removeFromQueue,
      clearQueue,
      close,
      toggle,
      next,
      prev,
      seek,
      skip,
      toggleShuffle,
      toggleFavorite,
      offlineUserId,
      setOfflineUserId,
      sleepTimer,
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
        /* `playing`, а не `canplay`: первое означает, что звук пошёл, второе
           — что данных хватает. Между ними на медленном канале умещается
           заметная пауза, и снимать вертушку на `canplay` значит показать
           «играет» раньше, чем зазвучало. */
        onPlaying={() => {
          setIsLoading(false);
          setLoadError(null);
        }}
        /* Буфер кончился посреди записи — то же ожидание, что и в начале. */
        onWaiting={() => setIsLoading(true)}
        onPause={() => {
          setIsPlaying(false);
          setIsLoading(false);
        }}
        /* Отказ сети или битый файл: вертушка иначе крутится вечно и врёт,
           что вот-вот заиграет. */
        onError={() => {
          setIsPlaying(false);
          setIsLoading(false);
          setLoadError(mediaErrorText(audioRef.current?.error ?? null));
        }}
      />
    </MusicPlayerContext.Provider>
  );
}
