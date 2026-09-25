"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { AnimationEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getModalOpen,
  getModalOpenServer,
  subscribeModals,
} from "./modal-watch";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "@/components/music/music-cover";
import { MusicMarqueeText } from "@/components/music/marquee-text";
import { MusicPositionSlider } from "@/components/music/player/position-slider";
import { MusicPlayingBars } from "./playing-bars";
import { useMusicPlayer } from "./player-provider";
import { useMusicRadio } from "../radio/radio-provider";
import { MusicPlayGlyph, playButtonLabel } from "./play-glyph";
import { MusicSleepCountdown } from "./sleep-countdown";
import { MusicQueuePanel } from "./queue-panel";
import { MusicLyricsButton } from "./lyrics-button";
import { useHoldSeek } from "./use-hold-seek";
import {
  ArrowDownToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  BookmarkPlus,
  ChevronsRight,
  History,
  ListEnd,
  PictureInPicture2,
  Pause,
  Play,
  Settings,
} from "lucide-react";
import {
  MusicPlayerSettingsPanel,
  type PlayerPanelTab,
} from "./player-settings-panel";
import { SeekStepGlyph } from "./seek-step-glyph";
import { pinnedEqualizer, pinnedLayout, seekButtonLabel } from "./player-prefs";
import { seekHotkeyDirection } from "./seek-hotkeys";
import { bookmarkSavedText } from "./player-marks";
import { useTrackBookmarks } from "./use-track-bookmarks";
import { LIFTED_KEY, liftButtonLabel, parseLifted, serializeLifted } from "./player-lift";
import {
  PLAYER_VIEW_KEY,
  parsePlayerView,
  reservedPlayerSpace,
  serializePlayerView,
  type PlayerView,
} from "./player-view";
import { MUSIC_PLAYER_REVEAL_EVENT } from "./player-reveal";
import {
  DEFAULT_PLAYBACK_MODE,
  nextPlaybackMode,
  playbackModeLabel,
  type MusicPlaybackMode,
} from "./play-mode";

/**
 * Полоса плеера внизу экрана. См. макет `.design/music/MiniPlayer.dc.html`.
 *
 * Показывается, только когда есть что играть: пустая полоса занимала бы
 * место на каждой странице портала ради ничего. Отступ снизу — по
 * `safe-area`, иначе на телефоне её съедает системная полоса жестов.
 *
 * Кнопки — настоящие `<button>` с именами: в макете это кружки без текста, и
 * скринридер иначе прочитал бы полосу как набор безымянных кнопок. Мелкие
 * значки внутри помечены `aria-hidden` — имя несёт сама кнопка.
 */

/** Скорости из плана: лекции ускоряют, киртаны — нет, но одна кнопка дешевле двух режимов. */
const RATES = [1, 1.25, 1.5, 2, 0.75] as const;

const icon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function MiniPlayer() {
  const player = useMusicPlayer();
  // Поверх полосы открыто окно задачи или другое модальное (VED-499).
  const modalOpen = useSyncExternalStore(
    subscribeModals,
    getModalOpen,
    getModalOpenServer,
  );
  const pathname = usePathname();
  const [queueOpen, setQueueOpen] = useState(false);
  /**
   * Вид полосы: развёрнута, свёрнута, пузырь (VED-366). Помним между
   * переходами и перезагрузками: иначе человек сворачивает её на каждой
   * странице заново, и сворачивание теряет весь смысл.
   */
  const [view, setViewState] = useState<PlayerView>("expanded");
  const collapsed = view === "collapsed";
  /**
   * Выкат полосы (из пузыря или по вызову снаружи). Счётчик — ключ полосы,
   * чтобы анимация шла заново на каждый вызов; он только растёт: сброс
   * ключа пересоздал бы полосу и выбил из неё фокус. Класс анимации снимает
   * `entering`.
   */
  const [enterSeq, setEnterSeq] = useState(0);
  const [entering, setEntering] = useState(false);
  /** Обёртка и видимая полоса — для замера места под ней. */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  /** Пузырь и кнопка «в пузырь»: между ними переходит фокус. */
  const bubbleRef = useRef<HTMLButtonElement | null>(null);
  const toBubbleRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterViewRef = useRef<"bubble" | "toBubble" | null>(null);
  const [lifted, setLifted] = useState(false);
  /** Открытая вкладка панели «Плеер» (VED-388); `null` — панель закрыта. */
  const [panelTab, setPanelTab] = useState<PlayerPanelTab | null>(null);
  /** Кнопка, открывшая панель: туда вернётся фокус после закрытия. */
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  /**
   * Объявление для скринридера: метка поставлена, позиция после перемотки.
   * Без него быстрая «Метка» и Shift+стрелка срабатывали бы молча — для
   * незрячего человека неотличимо от «не сработало».
   */
  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((text: string) => {
    // Тот же текст второй раз подряд живая область не перечитывает —
    // неразрывный пробел в конце делает его «новым».
    setAnnouncement((was) => (was === text ? `${text}\u00a0` : text));
  }, []);

  /* Читаем эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
     инициализатор вернул бы «развёрнута», а на клиенте — «свёрнута», и это
     расхождение гидратации. Тем же способом читает своё значение провайдер
     плеера и `theme-provider`. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий
       выше: ленивый useState здесь даёт расхождение гидратации. Тот же
       приём и та же причина, что в `player-provider.tsx` и
       `theme-provider.tsx`. */
    try {
      setViewState(parsePlayerView(window.localStorage.getItem(PLAYER_VIEW_KEY)));
      if (parseLifted(window.localStorage.getItem(LIFTED_KEY))) {
        setLifted(true);
      }
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setView = useCallback((next: PlayerView | ((was: PlayerView) => PlayerView)) => {
    setViewState((was) => {
      const value = typeof next === "function" ? next(was) : next;
      try {
        window.localStorage.setItem(PLAYER_VIEW_KEY, serializePlayerView(value));
      } catch {
        // см. выше
      }
      return value;
    });
  }, []);

  const toggleCollapsed = () =>
    setView((was) => (was === "collapsed" ? "expanded" : "collapsed"));

  /** Свернуть в плавающий пузырь (VED-366). */
  const toBubble = () => {
    setQueueOpen(false);
    setPanelTab(null);
    focusAfterViewRef.current = "bubble";
    setView("bubble");
  };

  /** Из пузыря — обратно в развёрнутую полосу, с выкатом. */
  const fromBubble = () => {
    focusAfterViewRef.current = "toBubble";
    setEnterSeq((n) => n + 1);
    setEntering(true);
    setView("expanded");
  };

  /* Фокус следует за видом: нажатая кнопка исчезает вместе с полосой или
     пузырём, и без переноса фокус падал бы в начало страницы. */
  useEffect(() => {
    const target = focusAfterViewRef.current;
    if (!target) return;
    focusAfterViewRef.current = null;
    (target === "bubble" ? bubbleRef : toBubbleRef).current?.focus();
  }, [view]);

  /* Горячая кнопка «Плеер» (VED-416) просит показать полосу свёрнутой —
     см. `player-reveal.ts`. Сворачиваем с запоминанием, как своей кнопкой,
     в том числе из пузыря (VED-366), и выкатываем снизу. Звук здесь не
     трогаем: играть или нет, решает тот, кто просит. */
  useEffect(() => {
    const onReveal = () => {
      setEnterSeq((n) => n + 1);
      setEntering(true);
      setView("collapsed");
    };
    window.addEventListener(MUSIC_PLAYER_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(MUSIC_PLAYER_REVEAL_EVENT, onReveal);
  }, [setView]);

  const toggleLifted = () => {
    setLifted((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(LIFTED_KEY, serializeLifted(next));
      } catch {
        // см. выше
      }
      return next;
    });
  };

  /* Перемотка удержанием — до всех ранних возвратов: порядок хуков не
     зависит от того, есть ли что играть. Обёртка вокруг `player.skip`
     нужна потому, что провайдер может быть ещё пуст, а хук объявляется
     раньше проверки. */
  const seekBy = useCallback(
    (seconds: number) => player?.skip(seconds),
    [player],
  );
  const holdPrev = useHoldSeek({
    direction: -1,
    seekBy,
    onTap: () => player?.prev(),
    disabled: !player?.hasPrev,
  });
  const holdNext = useHoldSeek({
    direction: 1,
    seekBy,
    onTap: () => player?.next(),
    disabled: !player?.hasNext,
  });

  const bookmarks = useTrackBookmarks(player?.current?.id ?? null);
  // Метки видны на дорожке (VED-450), поэтому список читается сразу при
  // смене записи, а не только в открытой вкладке «Метки».
  const loadBookmarks = bookmarks.load;
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);
  const markSeconds = useMemo(
    () => (bookmarks.items ?? []).map((item) => item.positionSeconds),
    [bookmarks.items],
  );

  /**
   * Перемотка на шаг из настроек (VED-388) — кнопками, клавиатурой.
   * Позицию после сдвига объявляем: кнопка сама говорит только, что
   * сделает, а куда пришли — нет.
   */
  const seekStep = useCallback(
    (direction: -1 | 1) => {
      if (!player?.current) return;
      const { prefs } = player;
      const step = direction < 0 ? prefs.seekBackSeconds : prefs.seekForwardSeconds;
      const total = player.durationSeconds || player.current.durationSeconds;
      const at = Math.max(
        0,
        Math.min(total || Number.POSITIVE_INFINITY, player.positionSeconds + direction * step),
      );
      player.skip(direction * step);
      announce(`${seekButtonLabel(direction, step)}: ${formatTrackDuration(at)}`);
    },
    [player, announce],
  );

  /** Быстрая «Метка»: ставит на текущее место без вопросов, подпись — потом. */
  const quickBookmark = useCallback(() => {
    if (!player?.current) return;
    void bookmarks.add(player.positionSeconds).then((created) => {
      announce(created ? bookmarkSavedText(created) : "Не удалось поставить метку");
    });
  }, [player, bookmarks, announce]);

  // Shift+← / Shift+→ (VED-388). Через ref: подписка одна на всё время
  // жизни полосы, а шаг и позиция — всегда свежие.
  const seekStepRef = useRef(seekStep);
  useEffect(() => {
    seekStepRef.current = seekStep;
  }, [seekStep]);
  const hasTrack = Boolean(player?.current);
  useEffect(() => {
    if (!hasTrack) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const direction = seekHotkeyDirection(event, {
        tagName: target?.tagName,
        isContentEditable: target?.isContentEditable,
        type: target instanceof HTMLInputElement ? target.type : undefined,
        role: target?.getAttribute("role"),
      });
      if (direction === null) return;
      event.preventDefault();
      seekStepRef.current(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasTrack]);

  const openPanel = useCallback((tab: PlayerPanelTab) => {
    panelOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQueueOpen(false);
    setPanelTab((was) => (was === tab ? null : tab));
  }, []);

  const closePanel = useCallback(() => {
    setPanelTab(null);
    // Фокус — туда, откуда открывали: иначе Tab после закрытия улетает в
    // начало страницы.
    const opener = panelOpenerRef.current;
    if (opener?.isConnected) opener.focus();
  }, []);

  /* Место под полосой — замером (замечание к PR #500): числа в globals.css
     остаются запасом на первую отрисовку, а дальше страница резервирует
     ровно столько, сколько полоса занимает от своего верха до низа окна.
     Верх берём от обёртки, а не от самой полосы: полосу двигает анимация
     выката, и замер посреди неё дал бы лишнее. */
  const onHome = pathname === "/";
  // Играет радио (VED-437) — на месте полосы стоит полоса эфира.
  const radioOn = Boolean(useMusicRadio()?.active);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !hasTrack || onHome || radioOn) return;
    const root = document.documentElement;
    const measure = () => {
      const bar = barRef.current;
      const top = bar
        ? wrap.getBoundingClientRect().top + bar.offsetTop
        : window.innerHeight;
      const space = reservedPlayerSpace(view, top, window.innerHeight);
      root.style.setProperty("--vm-player-measured", `${space}px`);
      wrap.dataset.measured = "true";
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    if (barRef.current) observer.observe(barRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--vm-player-measured");
      delete wrap.dataset.measured;
    };
  }, [view, lifted, hasTrack, onHome, radioOn]);

  // Полосы нет ни у гостя, ни когда слушать нечего.
  if (!player?.current) return null;

  // На главной портала полосу не рисуем: там стоит карточка Музыки со своим
  // управлением, и две панели одного плеера на одном экране спорят друг с
  // другом. Прячем по пути, а не пропсом из layout: полоса монтируется в
  // корневом layout один раз на всё приложение, и там про страницы ничего
  // не известно.
  if (onHome) return null;
  if (radioOn) return null;

  const {
    current,
    isPlaying,
    isLoading,
    loadError,
    positionSeconds,
    durationSeconds,
    playMode,
    shuffle,
    rate,
    volume,
    muted,
    isPrivateSession,
    isFavorite,
    hasNext,
    hasPrev,
    prefs,
  } = player;

  /* Вынесенные кнопки (VED-388) — отдельной строкой под полосой, одной на
     все: во второй строке телефона места нет (326 из 327 точек на 375), в
     полосе `sm` средней колонке достаётся ~120 точек, а однострочная
     полоса широкого экрана занята до последней точки. Перемотка на
     широком экране стоит в ряду управления всегда, поэтому одна она строку
     там не заводит. Строка появляется, только когда что-то вынесено: по
     умолчанию полоса не выросла ни на точку. */
  const pinned = pinnedLayout(prefs);
  const equalizer = pinnedEqualizer(prefs);

  // Ожидание важнее «играет»: пока звука нет, полоса не должна показывать
  // паузу — это единственная кнопка, по которой судят, сработало ли нажатие.
  const playState = isLoading ? "loading" : isPlaying ? "playing" : "paused";

  /* Длина очереди — в имени кнопки, а не значком поверх неё: значок в углу
     кружка 40×40 нечитаем, а скринридеру он не говорит вообще ничего. */
  const queueLength = player.queue.length;

  const total = durationSeconds || current.durationSeconds;
  // `shrink-0` не для красоты: без него флекс ужимал кнопки в правой группе
  // до 17px по ширине при заявленных 32, а цель меньше 24×24 не проходит по
  // WCAG 2.5.8 — и пальцем в неё не попасть безо всякого стандарта.
  const ctrl =
    "flex shrink-0 items-center justify-center rounded-full text-text-1 transition-colors hover:text-text-0 disabled:opacity-40";

  /* На телефоне полоса стоит на самом нижнем крае окна, стык в стык с
     системной панелью (VED-411, VED-282): без полей по бокам и снизу, со
     скруглением только сверху. Отступ от полосы жестов — внутри полосы
     (`env(safe-area-inset-bottom)`): фон уходит под неё, а кнопки — нет.
     Поднятая полоса (VED-194) висит над нижним рядом раздела и остаётся
     плавающей карточкой с полями — прилипать ей не к чему. */
  const docked = !lifted;
  const dockBar = docked
    ? "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
    : "";
  const enterClass = entering ? "player-enter" : "";
  // Только своя анимация: `animationend` всплывает и от титров названия.
  const endEnter = (event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) setEntering(false);
  };

  return (
    <div
      ref={wrapRef}
      // `pointer-events-none` на обёртке, чтобы прозрачные поля по краям не
      // перехватывали клики по странице под полосой.
      //
      // `data-music-player` — зацепка для `body:has(...)` в globals.css:
      // полоса лежит поверх страницы, и без отступа снизу последняя строка
      // любого раздела портала оказывалась под ней.
      data-music-player=""
      // Свёрнутой полосе нужно меньше места, и отступ страницы обязан
      // следовать за ней: иначе под полоской в 48 точек остаётся дыра в 150.
      // Правило — в globals.css рядом с основным.
      data-collapsed={collapsed ? "true" : "false"}
      data-view={view}
      // Поднятая полоса (VED-194) стоит выше на `--vm-player-lift`, и отступ
      // страницы растёт вместе с ней — правило там же, в globals.css.
      data-lifted={lifted ? "true" : "false"}
      // Строка вынесенных кнопок (VED-388) добавляет полосе высоты от `sm`
      // (на телефоне кнопки встают в ряд управления, VED-410) — отступ
      // страницы растёт вместе с ней, правило в globals.css.
      data-pinned={view === "expanded" ? pinned : "none"}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 ${
        docked
          ? "sm:px-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {view === "bubble" ? (
        /* Плавающий пузырь (VED-366): полупрозрачный кружок с обложкой у
           левого края, ближе к низу. Места у страницы не занимает. Высота —
           над нижним рядом разделов (поле ввода чата, кнопки ленты
           «Вдохновения»), чтобы не закрывать их левую кнопку. Нажатие
           разворачивает полосу обратно. */
        <button
          ref={bubbleRef}
          type="button"
          aria-label={`Развернуть плеер: ${current.title}${isPlaying ? ", играет" : ", на паузе"}`}
          title="Развернуть плеер"
          onClick={fromBubble}
          className="player-bubble pointer-events-auto fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-3 flex size-14 items-center justify-center overflow-hidden rounded-full"
        >
          <span aria-hidden="true" className="absolute inset-1 overflow-hidden rounded-full opacity-70">
            <MusicCover url={current.coverUrl} seed={current.id} alt="" rounded="rounded-full" />
          </span>
          {/* Три столбика эквалайзера: играет — пляшут, пауза — стоят.
              Полосу `MusicPlayingBars` не взяли: в ней 14 столбиков, в
              кружок 32 точки она не входит. */}
          <span
            aria-hidden="true"
            className={`relative flex size-8 items-center justify-center gap-[3px] rounded-full bg-bg-0/85 ${
              isPlaying ? "" : "music-eq-paused"
            }`}
          >
            {[9, 15, 11].map((height, at) => (
              <span
                key={at}
                className="music-eq-bar w-[3px] rounded-full bg-violet"
                style={{ height, animationDuration: `${[780, 1080, 900][at]}ms` }}
              />
            ))}
          </span>
        </button>
      ) : collapsed ? (
        /* Свёрнутая полоска: обложка, название, переход по записям и пуск
           (VED-368). Всё остальное — в развёрнутом виде и на странице записи.
           Смысл ровно один: «не мешай, но играй», поэтому здесь нет ни
           дорожки, ни перемотки кнопками. Зазоры ужаты, чтобы «назад» и
           «вперёд» встали без потери названия. */
        <section
          ref={barRef}
          key={`collapsed-${enterSeq}`}
          aria-label="Плеер, свёрнут"
          onAnimationEnd={endEnter}
          className={`player-bar pointer-events-auto mx-auto flex h-12 max-w-5xl items-center gap-1 rounded-2xl px-2 min-[400px]:gap-1.5 min-[400px]:px-2.5 ${
            docked
              ? "max-sm:h-[calc(3rem+env(safe-area-inset-bottom))] max-sm:pb-[env(safe-area-inset-bottom)]"
              : ""
          } ${dockBar} ${enterClass}`}
        >
          <Link
            href={`/music/tracks/${current.id}`}
            aria-label={`Открыть запись: ${current.title}`}
            className="size-8 shrink-0 overflow-hidden rounded-lg max-[339px]:hidden"
          >
            {/* `contain` (VED-248): даже в свёрнутой полоске широкая
                обложка должна быть видна целиком, не урезанной до
                квадрата. */}
            <MusicCover
              url={current.coverUrl}
              seed={current.id}
              alt=""
              rounded="rounded-lg"
              fit="contain"
            />
          </Link>

          <MusicMarqueeText
            key={current.id}
            text={current.title}
            className="ml-1 min-w-0 flex-1 text-[13px] font-semibold text-text-0"
          />

          <MusicPlayingBars
            playing={isPlaying}
            className="h-3.5 w-12 shrink-0 max-[419px]:hidden"
          />

          <PrevButton
            hasPrev={hasPrev}
            hold={holdPrev}
            className={`${ctrl} h-10 w-9`}
          />

          <button
            type="button"
            aria-label={playButtonLabel(playState)}
            onClick={player.toggle}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint"
          >
            <MusicPlayGlyph state={playState} className="size-3" />
          </button>

          <NextButton
            hasNext={hasNext}
            hold={holdNext}
            className={`${ctrl} h-10 w-9`}
          />

          <button
            type="button"
            aria-label="Развернуть плеер"
            aria-expanded={false}
            onClick={toggleCollapsed}
            className={`${ctrl} h-10 w-8`}
          >
            <svg {...icon} className="size-4">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>

          <LiftButton
            lifted={lifted}
            onToggle={toggleLifted}
            className={`${ctrl} h-10 w-8`}
          />

          <button
            type="button"
            aria-label="Закрыть плеер"
            onClick={player.close}
            className={`${ctrl} h-10 w-8`}
          >
            <svg {...icon} className="size-4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </section>
      ) : (
      <section
        ref={barRef}
        key={`expanded-${enterSeq}`}
        aria-label="Плеер"
        onAnimationEnd={endEnter}
        // На телефоне полоса в три строки (VED-410): название с кнопками
        // записи и полосы; управление с вынесенными кнопками; дорожка. Все
        // кнопки встают в эти три строки, и вынесенные в настройках кнопки
        // полосу не растят. Поэтому здесь `flex-wrap` и порядок элементов
        // задан явно, а с `sm` возвращается однострочная раскладка из
        // PortalWide.dc.html.
        //
        // Зазоры между элементами на телефоне — внутри групп, а не у полосы:
        // общий `gap-x` в ряду из девяти кнопок съедал 64 точки из 336.
        //
        // `relative` — контекст позиционирования для MusicLyricsPanel: она
        // якорится от всей полосы, а не от узкой кнопки-триггера в середине
        // ряда, иначе на 360-390px уезжает за левый край экрана (VED-248,
        // круг 2).
        //
        // С вынесенными кнопками (VED-388) полоса `sm`–`lg` переносит
        // строку: кнопки встают второй строкой, а не сжимают середину.
        className={`player-bar pointer-events-auto relative mx-auto flex max-w-5xl flex-wrap items-center gap-x-0 gap-y-1 rounded-2xl px-3 py-2 sm:gap-3 sm:px-[18px] lg:gap-5 ${
          docked ? "max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))]" : ""
        } ${dockBar} ${enterClass} ${
          pinned === "all"
            ? "sm:gap-y-2 sm:py-2"
            : pinned === "narrow"
              ? "sm:gap-y-2 sm:py-2 lg:h-16 lg:flex-nowrap lg:py-0"
              : "sm:h-16 sm:flex-nowrap sm:py-0"
        }`}
      >
        {/* Что играет. Обложка и название — одна ссылка на запись: две
            ссылки на одно и то же — лишний шаг в обходе клавиатурой. На
            телефоне уже 400 точек обложка уступает место названию: первая
            строка делит ширину с шестью кнопками (VED-410). */}
        <Link
          href={`/music/tracks/${current.id}`}
          aria-label={`Открыть запись: ${current.title}`}
          className="order-1 flex min-w-0 flex-1 items-center gap-2 rounded-[10px] min-[400px]:gap-3 sm:order-none sm:w-40 sm:flex-none lg:w-48"
        >
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] max-[399px]:hidden sm:block">
            {/* `contain` (VED-248): развёрнутая полоса — тоже витрина
                записи, а не плитка каталога; обрезать широкую обложку до
                квадрата здесь так же неверно, как на странице записи. */}
            <MusicCover
              url={current.coverUrl}
              seed={current.id}
              alt=""
              rounded="rounded-[10px]"
              fit="contain"
            />
          </span>
          <span className="flex min-w-0 flex-col">
            {/* Название едет титрами, когда не помещается: полоса узкая, а
                «Мир Прокисший (Prod. by…» не даёт узнать запись. Ключ по
                названию — чтобы при смене записи строка начинала сначала, а
                не доезжала остаток предыдущей. */}
            <MusicMarqueeText
              key={current.id}
              text={current.title}
              className="text-[13px] font-semibold text-text-0"
            />
            {/* Причина отказа вытесняет исполнителя, а не приписывается
                рядом: место под ней одно, и в ту секунду, когда запись не
                играет, имя исполнителя человеку не нужно. */}
            {loadError ? (
              <span className="truncate text-[11px] text-magenta" title={loadError}>
                {loadError}
              </span>
            ) : (
              <span className="truncate text-[11px] text-text-2">
                {current.artist?.name ?? "Исполнитель не указан"}
              </span>
            )}
          </span>
        </Link>
        {/* Отказ — живой областью вне ссылки: у ссылки своё имя
            («Открыть запись: …»), и текст внутри неё скринридер не читает.
            Для него молчащая кнопка ничем не отличается от работающей. */}
        {loadError && (
          <span role="status" className="sr-only">
            {loadError}
          </span>
        )}

        {/* Разрыв строки на телефоне. `flex-wrap` переносит только то, что не
            влезло, а здесь строку надо кончить раньше: иначе управление
            встаёт рядом с названием и оба сжимаются в ноль. Пустая полоска во
            всю ширину и нулевой высоты — единственный способ сказать это
            флексу. */}
        <span aria-hidden="true" className="order-3 h-0 w-full sm:hidden" />

        {/* Управление и дорожка.
            `contents` на телефоне: обёртка перестаёт быть коробкой, и кнопки
            с дорожкой становятся прямыми детьми полосы — только так дорожка
            может уехать на свою строку во всю ширину. С `sm` обёртка снова
            коробка, и колонка «кнопки над дорожкой» из макета возвращается. */}
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5">
          {/* На телефоне ряд по содержимому: справа от него встают
              вынесенные кнопки и кнопки положения полосы (VED-410). На `sm`
              ряд стоит по центру колонки. */}
          <div className="order-4 flex shrink-0 items-center gap-0.5 min-[400px]:gap-1.5 sm:order-none sm:gap-2">
            {/* С `md` — в ряду управления; на телефоне та же кнопка стоит
                у дорожки, ниже (VED-133). Раньше обе прятались до `lg`, и с
                телефона перемешать было нечем. Не с `sm`: на 640 средней
                колонке достаётся ~118 точек, а ряд с двумя новыми кнопками
                занимает 192 — наехал бы на название и кнопки записи. */}
            <ShuffleButton
              on={shuffle}
              onToggle={player.toggleShuffle}
              className={`${ctrl} hidden h-7 w-7 md:flex`}
            />

            {/* В ряду — только на широком экране. На телефоне перемотка —
                удержанием и пальцем по дорожке, а кнопки с шагом выносятся
                из настроек плеера (VED-388) в этот же ряд справа. */}
            <button
              type="button"
              aria-label={seekButtonLabel(-1, prefs.seekBackSeconds)}
              title={seekButtonLabel(-1, prefs.seekBackSeconds)}
              onClick={() => seekStep(-1)}
              className={`${ctrl} hidden h-8 min-w-8 px-1 lg:flex`}
            >
              <SeekStepGlyph direction={-1} seconds={prefs.seekBackSeconds} />
            </button>

            {/* Пара к «Следующей»: без неё промах по «дальше» стоил бы
                возврата в список, а на телефоне это весь экран. */}
            <PrevButton
              hasPrev={hasPrev}
              hold={holdPrev}
              className={`${ctrl} h-11 w-9 min-[400px]:w-10 sm:h-8 sm:w-8`}
            />

            <button
              type="button"
              aria-label={playButtonLabel(playState)}
              onClick={player.toggle}
              // 44px на телефоне — и размер из макета, и минимальная цель
              // пальца; на широком экране полоса всего 64px высотой, там 40.
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint sm:h-10 sm:w-10"
            >
              <MusicPlayGlyph state={playState} />
            </button>

            <NextButton
              hasNext={hasNext}
              hold={holdNext}
              className={`${ctrl} h-11 w-9 min-[400px]:w-10 sm:h-8 sm:w-8`}
            />

            <button
              type="button"
              aria-label={seekButtonLabel(1, prefs.seekForwardSeconds)}
              title={seekButtonLabel(1, prefs.seekForwardSeconds)}
              onClick={() => seekStep(1)}
              className={`${ctrl} hidden h-8 min-w-8 px-1 lg:flex`}
            >
              <SeekStepGlyph direction={1} seconds={prefs.seekForwardSeconds} />
            </button>

            {/* Режим проигрывания вместо «Повтора» (VED-132). */}
            <PlayModeButton
              mode={playMode}
              onChange={player.setPlayMode}
              className={`${ctrl} hidden h-7 w-7 md:flex`}
            />
          </div>

          {/* Телефон: третья строка — перемешивание, дорожка, режим.
              Разрыв — тот же приём, что после названия: на широком телефоне
              кнопки иначе вскочили бы во вторую строку. */}
          <span aria-hidden="true" className="order-7 h-0 w-full sm:hidden" />
          <ShuffleButton
            on={shuffle}
            onToggle={player.toggleShuffle}
            className={`${ctrl} order-8 h-10 w-9 sm:hidden`}
          />
          {/* Дорожка и «Текст» — один ряд: дорожка тянется и отдаёт кнопке
              ~48px без переноса. */}
          <div className="order-9 flex min-w-0 flex-1 items-center gap-1 px-1 sm:order-none sm:w-full sm:max-w-[380px] sm:flex-none sm:gap-1.5 sm:px-0">
            <MusicPositionSlider
              className="flex min-w-0 flex-1 items-center gap-2"
              position={positionSeconds}
              total={total}
              onSeek={player.seek}
              marks={markSeconds}
            />
            <MusicLyricsButton
              trackId={current.id}
              className={`${ctrl} h-10 w-10 sm:h-8 sm:w-8`}
            />
            {/* Настройки плеера на телефоне (VED-388) — в строке дорожки:
                дорожка тянется, и ей есть чем поделиться. На `sm` и шире та
                же кнопка стоит справа, у очереди. */}
            <SettingsButton
              open={panelTab !== null && panelTab !== "history"}
              onClick={() => openPanel("settings")}
              className={`${ctrl} h-10 w-9 sm:hidden`}
            />
          </div>
          <PlayModeButton
            mode={playMode}
            onChange={player.setPlayMode}
            className={`${ctrl} order-10 h-10 w-9 sm:hidden`}
          />
        </div>

        {/* Скорость, сердце, очередь, невидимый сеанс, громкость.
            На телефоне — в первой строке, у названия (VED-410: «перемести
            кнопки, чтобы размер плеера не увеличивался, когда их
            добавляешь»): ряд управления освобождается под вынесенные
            кнопки. Громкость на телефоне системная и не рисуется.

            `contents` на телефоне у внешней коробки: её половины встают в
            разные строки полосы. На `sm` коробка снова коробка — правая
            колонка макета. */}
        {/* Ширина здесь только нижняя (`min-w`), хотя слева у названия она
            жёсткая. Жёсткая была и тут — ради симметрии макета, — но пять
            кнопок с ползунком громкости в 224px не помещаются, а
            `justify-end` выкладывает лишнее влево, за начало коробки: чип
            скорости наезжал на «вперёд» и повтор. Теперь колонка берёт по
            содержимому, а середина ужимается — ей есть чем: дорожка тянется. */}
        <div className="contents sm:order-none sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:justify-end sm:gap-1 lg:min-w-56 lg:gap-1.5">
          {/* Действия над записью. */}
          <div className="order-2 ml-2 flex shrink-0 items-center gap-0 min-[400px]:gap-0.5 sm:ml-0 sm:contents">
            <button
              type="button"
              aria-label={`Скорость ${rate.toFixed(2).replace(/0$/, "")}×, сменить`}
              onClick={() =>
                player.setRate(RATES[(RATES.indexOf(rate as 1) + 1) % RATES.length])
              }
              // Видно и на телефоне: лекцию слушают на 1.5×, и это ровно тот
              // случай, когда переключатель нужен под рукой. Высота цели —
              // 40, как у соседей; рамка чипа рисуется внутри неё.
              className="group flex h-10 shrink-0 items-center px-0.5 text-[11px] font-semibold text-text-1 hover:text-text-0 sm:h-7 sm:px-0"
            >
              <span className="flex h-7 items-center rounded-full border border-glass-brd px-2 max-[359px]:px-1.5 sm:px-2.5">
                {rate.toFixed(2).replace(/0$/, "").replace(/\.$/, "")}×
              </span>
            </button>

            <button
              type="button"
              aria-label={isFavorite ? "Убрать из избранного" : "В избранное"}
              aria-pressed={isFavorite}
              onClick={player.toggleFavorite}
              className={`${ctrl} h-10 w-8 min-[360px]:w-9 sm:h-8 sm:w-8 ${isFavorite ? "text-magenta" : "text-text-2"}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={isFavorite ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
              </svg>
            </button>

            {/* Очередь. Панель на телефоне якорится от всей полосы
                (`static` у обёртки, `relative` у полосы), а не от кнопки:
                кнопка теперь в первой строке, и панель шириной в экран от её
                правого края уезжала бы за левый край. */}
            <div className="max-sm:static sm:relative">
              <button
                type="button"
                aria-label={
                  queueOpen ? "Закрыть очередь" : `Очередь, записей: ${queueLength}`
                }
                aria-expanded={queueOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setPanelTab(null);
                  setQueueOpen((was) => !was);
                }}
                className={`${ctrl} h-10 w-8 min-[360px]:w-9 sm:h-8 sm:w-8 ${queueOpen ? "text-violet" : "text-text-2"}`}
              >
                <svg {...icon} className="h-4 w-4">
                  <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
                </svg>
              </button>
              {/* На телефоне — нулевая по высоте опора над полосой с полями
                  по 12 точек: полоса там во всю ширину, и панель у её
                  правого края прилипала к краю экрана. С `sm` опоры нет
                  (`contents`), панель якорится от обёртки кнопки. */}
              {queueOpen && (
                <div className="pointer-events-none absolute inset-x-3 bottom-full sm:contents">
                  <MusicQueuePanel onClose={() => setQueueOpen(false)} />
                </div>
              )}
            </div>

            <SettingsButton
              open={panelTab !== null && panelTab !== "history"}
              onClick={() => openPanel("settings")}
              className={`${ctrl} hidden h-8 w-8 sm:flex`}
            />

            {/* Плейлисты — этап 4. До него это ссылка на карточку записи: тот же
                портально-безопасный адрес, что у кнопки в ленте друзей. */}
            <Link
              href={`/music/tracks/${current.id}?add=1`}
              aria-label="В плейлист"
              className={`${ctrl} hidden h-8 w-8 text-text-2 lg:flex`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>

            <button
              type="button"
              aria-label={
                isPrivateSession
                  ? "Невидимый сеанс включён — друзья не видят"
                  : "Включить невидимый сеанс"
              }
              aria-pressed={isPrivateSession}
              onClick={player.togglePrivateSession}
              className={`${ctrl} h-10 w-8 min-[360px]:w-9 sm:h-8 sm:w-8 ${isPrivateSession ? "text-gold" : "text-text-2"}`}
            >
              <svg {...icon} className="h-4 w-4">
                {isPrivateSession ? (
                  <>
                    <path d="M2 2l20 20" />
                    <path d="M6.7 6.7A10.5 10.5 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 5.3-1.4" />
                    <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a17 17 0 0 1-3.3 4" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>

            {/* На телефоне громкость системная — ползунок прячем, кнопку нет. */}
            <button
              type="button"
              aria-label={muted ? "Включить звук" : "Выключить звук"}
              aria-pressed={muted}
              onClick={player.toggleMuted}
              className={`${ctrl} hidden h-8 w-8 text-text-2 lg:flex`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M11 5L6 9H2v6h4l5 4z" />
                {muted ? (
                  <path d="M22 9l-6 6M16 9l6 6" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                )}
              </svg>
            </button>

            <label className="hidden items-center lg:flex">
              <span className="sr-only">Громкость</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
                className="h-6 w-16 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-glass-brd [&::-webkit-slider-thumb]:mt-[-4.5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-1"
              />
            </label>

            {/* Отсчёт сон-таймера: не кнопка, а состояние. Появляется, только
                когда таймер заведён. На телефоне он во второй строке, у
                кнопок положения полосы: первая занята до точки. */}
            <span className="hidden sm:contents">
              <MusicSleepCountdown />
            </span>
          </div>

          {/* Действия над самой полосой. На телефоне «свернуть» и «закрыть»
              — в первой строке, у края, а «в пузырь» и «поднять» — в конце
              второй: первой строке не хватает ширины на все шесть кнопок
              записи и четыре полосы. С `sm` — все четыре последними в
              правой колонке. */}
          <div className="contents">
            <button
              type="button"
              aria-label="Свернуть плеер"
              aria-expanded={true}
              onClick={toggleCollapsed}
              className={`${ctrl} order-2 h-10 w-8 text-text-2 min-[360px]:w-9 sm:order-none sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <span className="order-6 ml-auto flex shrink-0 items-center sm:contents">
              <span className="contents sm:hidden">
                <MusicSleepCountdown />
              </span>
              {/* «Свернуть в плавающую кнопку» (VED-366). */}
              <button
                ref={toBubbleRef}
                type="button"
                aria-label="Свернуть плеер в плавающую кнопку"
                title="Свернуть в плавающую кнопку"
                onClick={toBubble}
                // На `sm`–`xl` в однострочной полосе ей нет места: правая
                // колонка наезжала на ряд управления. Пузырь — про телефон
                // («в левую часть экрана смартфона»), на планшете полосу
                // сворачивают кнопкой «Свернуть».
                className={`${ctrl} h-11 w-8 text-text-2 min-[400px]:w-9 sm:hidden xl:flex xl:h-8 xl:w-8`}
              >
                <PictureInPicture2 aria-hidden className="h-4 w-4" />
              </button>

              {/* «Поднять/опустить» (VED-194) — кнопка про положение
                  полосы, стоит с другими такими же. */}
              <LiftButton
                lifted={lifted}
                onToggle={toggleLifted}
                className={`${ctrl} h-11 w-8 min-[400px]:w-9 sm:h-8 sm:w-8`}
              />
            </span>

            <button
              type="button"
              aria-label="Закрыть плеер"
              onClick={player.close}
              className={`${ctrl} order-2 h-10 w-8 text-text-2 min-[360px]:w-9 sm:order-none sm:h-8 sm:w-8`}
            >
              <svg {...icon} className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Вынесенные кнопки (VED-388). На телефоне — во второй строке,
            справа от пуска (VED-410): строка там есть всегда, и полоса от
            вынесенных кнопок не растёт. От `sm` — своей строкой под полосой:
            в однострочной раскладке для них нет места.

            На телефоне кнопки прижаты вправо, к кнопкам полосы (VED-450,
            круг 2: «перенеси кнопку по стрелке, остальные появляются справа
            около неё»), а эквалайзер стоит слева, посередине свободного места.
            Эквалайзер своего размера и не растягивается: растянутый, он
            расходился редкими полосками. Пока ничего не вынесено — крупный,
            при одной-двух кнопках — меньше, при трёх-четырёх его нет
            (`pinnedEqualizer`). */}
        {(pinned !== "none" || equalizer !== "none") && (
          <div
            role={pinned !== "none" ? "group" : undefined}
            aria-label={pinned !== "none" ? "Вынесенные кнопки" : undefined}
            className={`order-5 ml-1 flex min-w-0 flex-1 items-center gap-0 min-[400px]:ml-2 sm:order-10 sm:ml-0 sm:w-full sm:flex-none sm:justify-center sm:gap-2 ${
              pinned === "none"
                ? "sm:hidden"
                : pinned === "narrow"
                  ? "lg:hidden"
                  : ""
            }`}
          >
            {equalizer !== "none" && (
              <span className="flex min-w-0 flex-1 justify-center sm:hidden">
                <MusicPlayingBars
                  playing={isPlaying}
                  className={
                    equalizer === "large"
                      ? "h-5 w-20 shrink-0 max-[359px]:w-12"
                      : "h-3.5 w-11 shrink-0 max-[359px]:hidden"
                  }
                />
              </span>
            )}
            <span className="ml-auto flex items-center gap-0 min-[400px]:gap-0.5 sm:ml-0 sm:gap-2">
              {prefs.showSeek && (
                <span className="contents lg:hidden">
                  <button
                    type="button"
                    aria-label={seekButtonLabel(-1, prefs.seekBackSeconds)}
                    onClick={() => seekStep(-1)}
                    className={`${ctrl} h-11 min-w-9 px-0.5 min-[400px]:min-w-10 sm:min-w-11 sm:px-2 lg:h-9 lg:min-w-9`}
                  >
                    <SeekStepGlyph direction={-1} seconds={prefs.seekBackSeconds} />
                  </button>
                  <button
                    type="button"
                    aria-label={seekButtonLabel(1, prefs.seekForwardSeconds)}
                    onClick={() => seekStep(1)}
                    className={`${ctrl} h-11 min-w-9 px-0.5 min-[400px]:min-w-10 sm:min-w-11 sm:px-2 lg:h-9 lg:min-w-9`}
                  >
                    <SeekStepGlyph direction={1} seconds={prefs.seekForwardSeconds} />
                  </button>
                </span>
              )}
              {prefs.showBookmark && (
                <BookmarkButton
                  onClick={quickBookmark}
                  className={`${ctrl} h-11 w-9 text-text-2 min-[400px]:w-10 sm:w-11 lg:h-9 lg:w-9`}
                />
              )}
              {prefs.showHistory && (
                <HistoryButton
                  open={panelTab === "history"}
                  onClick={() => openPanel("history")}
                  className={`${ctrl} h-11 w-9 min-[400px]:w-10 sm:w-11 lg:h-9 lg:w-9`}
                />
              )}
            </span>
          </div>
        )}

        {panelTab && (
          <MusicPlayerSettingsPanel
            tab={panelTab}
            onTab={setPanelTab}
            onClose={closePanel}
            onAnnounce={announce}
            bookmarks={bookmarks}
          />
        )}
      </section>
      )}
      {/* Пузырь «пуск / пауза» поверх модального окна (VED-499): окно
          накрывает полосу затемнением, и остановить музыку было нечем.
          Разворачивать плеер отсюда нельзя — только пуск и пауза, как просил
          заказчик. Порталом в `body`: у полосы свой слой z-40, и изнутри него
          выше окна (z-50) не подняться. */}
      {modalOpen &&
        createPortal(
          <button
            type="button"
            onClick={() => player.toggle()}
            aria-label={isPlaying ? `Пауза: ${current.title}` : `Играть: ${current.title}`}
            title={isPlaying ? "Пауза" : "Играть"}
            className="btn-mint fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 z-[70] flex size-12 items-center justify-center rounded-full shadow-lg"
          >
            {isPlaying ? (
              <Pause aria-hidden className="size-5" fill="currentColor" />
            ) : (
              <Play aria-hidden className="ml-0.5 size-5" fill="currentColor" />
            )}
          </button>,
          document.body,
        )}
      {/* Объявления полосы (VED-388). Вне свёрнутого/развёрнутого вида:
          живая область должна существовать до того, как в неё пишут. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type HoldSeek = ReturnType<typeof useHoldSeek>;

/**
 * «Предыдущая запись» с перемоткой удержанием. Одна кнопка на оба вида
 * полосы: в свёрнутом она появилась по VED-368.
 *
 * `aria-disabled`, а не `disabled`: перемотка относится к играющей записи,
 * а не к очереди, и на единственной записи настоящий `disabled` отнял бы
 * вместе с переходом и её — отключённая кнопка не получает событий
 * указателя вовсе.
 */
function PrevButton({
  hasPrev,
  hold,
  className,
}: {
  hasPrev: boolean;
  hold: HoldSeek;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={
        hasPrev
          ? "Предыдущая запись, удержание — перемотка назад"
          : "Перемотка назад удержанием"
      }
      title="Нажать — предыдущая запись, удержать — перемотка назад"
      aria-disabled={!hasPrev}
      {...hold.props}
      className={`${className} touch-none select-none aria-disabled:opacity-40 ${
        hold.seeking ? "text-violet" : ""
      }`}
    >
      <svg {...icon} className="h-4 w-4">
        <path d="M19 4L9 12l10 8z" />
        <path d="M5 5v14" />
      </svg>
    </button>
  );
}

/** «Следующая запись» с перемоткой удержанием. Пара к `PrevButton`. */
function NextButton({
  hasNext,
  hold,
  className,
}: {
  hasNext: boolean;
  hold: HoldSeek;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={
        hasNext
          ? "Следующая запись, удержание — перемотка вперёд"
          : "Перемотка вперёд удержанием"
      }
      title="Нажать — следующая запись, удержать — перемотка вперёд"
      aria-disabled={!hasNext}
      {...hold.props}
      className={`${className} touch-none select-none aria-disabled:opacity-40 ${
        hold.seeking ? "text-violet" : ""
      }`}
    >
      <svg {...icon} className="h-4 w-4">
        <path d="M5 4l10 8-10 8z" />
        <path d="M19 5v14" />
      </svg>
    </button>
  );
}

/** Настройки плеера (VED-388). Одна кнопка на два места полосы. */
function SettingsButton({
  open,
  onClick,
  className,
}: {
  open: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label="Настройки плеера"
      title="Настройки плеера"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onClick}
      className={`${className} ${open ? "text-violet" : "text-text-2"}`}
    >
      <Settings aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** Быстрая «Метка» (VED-388): ставит метку на текущее место. */
function BookmarkButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label="Поставить метку на текущем месте"
      title="Поставить метку"
      onClick={onClick}
      className={className}
    >
      <BookmarkPlus aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** «История» (VED-388): открывает панель плеера на вкладке истории. */
function HistoryButton({
  open,
  onClick,
  className,
}: {
  open: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label="История прослушанного"
      title="История прослушанного"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onClick}
      className={`${className} ${open ? "text-violet" : "text-text-2"}`}
    >
      <History aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** «Поднять/опустить плеер» (VED-194). Один компонент на оба вида полосы. */
function LiftButton({
  lifted,
  onToggle,
  className,
}: {
  lifted: boolean;
  onToggle: () => void;
  className: string;
}) {
  const label = liftButtonLabel(lifted);
  const Glyph = lifted ? ArrowDownToLine : ArrowUpToLine;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={lifted}
      onClick={onToggle}
      className={`${className} ${lifted ? "text-violet" : "text-text-2"}`}
    >
      <Glyph aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** «Перемешать». Один компонент на два места: ряд управления и строку дорожки. */
function ShuffleButton({
  on,
  onToggle,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label="Перемешать"
      aria-pressed={on}
      onClick={onToggle}
      className={`${className} ${on ? "text-violet" : "text-text-2"}`}
    >
      <svg {...icon} className="h-[15px] w-[15px]">
        <path d="M16 3l4 4-4 4" />
        <path d="M20 7H8a4 4 0 0 0-4 4v1" />
        <path d="M8 21l-4-4 4-4" />
        <path d="M4 17h12a4 4 0 0 0 4-4v-1" />
      </svg>
    </button>
  );
}

/**
 * Режим проигрывания (VED-132): значки, а не подписи — так просили, чтобы
 * поместилось на плеере. Имя кнопки называет текущий режим словами, `title`
 * показывает его же при наведении. Режим по умолчанию («альбом до конца»)
 * приглушён, остальные подсвечены: видно, что плеер поведёт себя иначе
 * обычного.
 */
function PlayModeButton({
  mode,
  onChange,
  className,
}: {
  mode: MusicPlaybackMode;
  onChange: (mode: MusicPlaybackMode) => void;
  className: string;
}) {
  const label = playbackModeLabel(mode);
  const Glyph =
    mode === "track" ? ArrowRightToLine : mode === "folder" ? ListEnd : ChevronsRight;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => onChange(nextPlaybackMode(mode))}
      className={`${className} ${mode === DEFAULT_PLAYBACK_MODE ? "text-text-2" : "text-violet"}`}
    >
      <Glyph aria-hidden className="h-4 w-4" />
    </button>
  );
}

