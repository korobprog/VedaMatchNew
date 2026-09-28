"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Play, Volume2, VolumeX } from "lucide-react";
import type {
  MotivationVideoCategoryDto,
  MotivationVideoDto,
  MotivationVideoPage,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { Tabs } from "./reels-feed";
import { reelsHref } from "./feed-style";
import { FEED_RESTART_EVENT } from "./feed-position";
import {
  appendVideos,
  shouldAutoplay,
  videoCategoryChips,
  videoTapAction,
  videoTapLabel,
} from "./video-feed-logic";

const API_URL = apiBase();

/** За сколько роликов до конца просить следующую страницу. */
const PRELOAD_AHEAD = 2;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Лента «Видео» (VED-246): короткие ролики редакции, по одному на экран.
 *
 * Отдельная от «Ленты» и «Открыток»: там посты с цитатами, здесь — ролики со
 * своим хранилищем и своим порядком (от новых к старым). Папки те же, что у
 * афоризмов, — строкой под рядом вкладок, как фильтр по категории.
 *
 * Ролик на экране стартует сам и без звука; касание — звук, следующее —
 * пауза (`videoTapAction`). При `prefers-reduced-motion` сам не стартует.
 */
export function VideoFeed({
  initial,
  categories,
  category,
}: {
  initial: MotivationVideoPage;
  categories: MotivationVideoCategoryDto[];
  category?: string;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Звук — на всю ленту: включил на одном ролике — следующие тоже со звуком,
  // как в больших лентах. Жест уже был, браузер это разрешит.
  const [soundOn, setSoundOn] = useState(false);
  const pendingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* «К началу ленты» из меню ☰ (VED-639): к первому ролику открытой ленты.
     Активным его сделает наблюдатель слайда, когда тот доедет до экрана. */
  useEffect(() => {
    const onRestart = () => {
      const container = containerRef.current;
      if (!container) return;
      container.scrollTo({ top: 0 });
      container.focus({ preventScroll: true });
    };
    window.addEventListener(FEED_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(FEED_RESTART_EVENT, onRestart);
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const query = new URLSearchParams({ cursor });
      if (category) query.set("category", category);
      const response = await apiFetch(`${API_URL}/motivation/videos?${query}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      const page = (await response.json()) as MotivationVideoPage;
      setItems((current) => appendVideos(current, page.items));
      setCursor(page.nextCursor);
    } catch {
      setError("Не удалось загрузить следующие видео");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [cursor, category]);

  // Подгрузка — из активации слайда, а не из эффекта: момент тот же (человек
  // долистал), а setState не каскадирует.
  function activate(index: number) {
    setActiveIndex(index);
    if (index >= items.length - 1 - PRELOAD_AHEAD) void loadMore();
  }

  const chips = videoCategoryChips(categories, category);

  return (
    <div className="relative h-full overflow-hidden rounded-3xl bg-black text-white">
      <Tabs tab="video" category={category} />
      {chips.length > 1 && (
        <nav
          aria-label="Категории видео"
          className="absolute inset-x-0 top-14 z-20 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex w-max gap-2">
            {chips.map((chip) => (
              <li key={chip.slug ?? "all"}>
                <Link
                  href={chip.href}
                  aria-current={chip.current ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-sm font-medium drop-shadow transition-colors ${
                    chip.current
                      ? "border-white bg-white text-black"
                      : "border-white/30 bg-black/40 text-white hover:bg-black/60"
                  }`}
                >
                  {chip.nested && (
                    <span aria-hidden="true" className="mr-1 text-white/70">
                      ·
                    </span>
                  )}
                  {chip.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-display text-lg">
            {category
              ? "В этой категории видео пока нет"
              : "Видео скоро появятся"}
          </p>
          {category && (
            <Link
              href={reelsHref({ tab: "video" })}
              className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Все видео
            </Link>
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          role="feed"
          aria-label="Лента видео"
          aria-busy={pending}
          tabIndex={-1}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((video, index) => (
            <VideoSlide
              key={video.id}
              video={video}
              position={index + 1}
              total={cursor ? -1 : items.length}
              active={index === activeIndex}
              soundOn={soundOn}
              onSound={setSoundOn}
              onActive={() => activate(index)}
            />
          ))}
          {(pending || error) && (
            <div className="flex h-24 snap-start items-center justify-center gap-3 text-sm text-white/80">
              {pending ? (
                "Загружаем…"
              ) : (
                <>
                  <span role="alert">{error}</span>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="rounded-lg border border-white/30 px-3 py-1.5 hover:bg-white/10"
                  >
                    Ещё раз
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoSlide({
  video,
  position,
  total,
  active,
  soundOn,
  onSound,
  onActive,
}: {
  video: MotivationVideoDto;
  position: number;
  /** Сколько всего; −1 — ещё не известно (есть следующие страницы). */
  total: number;
  active: boolean;
  soundOn: boolean;
  onSound: (on: boolean) => void;
  onActive: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onActiveRef = useRef(onActive);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  // Слайд активен, когда на экране больше половины: как в ленте рилсов.
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6)
          onActiveRef.current();
      },
      { threshold: [0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const sync = () => {
      const autoplay = shouldAutoplay({
        active,
        reducedMotion: prefersReducedMotion(),
        visible: document.visibilityState === "visible",
      });
      if (autoplay) {
        // play() возвращает промис не везде (старые Safari, тестовая среда).
        const started: unknown = element.play();
        if (started instanceof Promise) started.catch(() => undefined);
      } else if (!active || document.visibilityState !== "visible") {
        // Под reduced motion запущенный касанием ролик не глушим, пока он на
        // экране: его включил сам человек.
        element.pause();
      }
    };
    sync();
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
    };
  }, [active]);

  // React выставляет `muted` только при монтировании — доводим сами.
  useEffect(() => {
    const element = videoRef.current;
    if (element) element.muted = !soundOn;
  }, [soundOn]);

  const action = videoTapAction({ paused, muted: !soundOn });

  function tap() {
    const element = videoRef.current;
    if (!element) return;
    if (action === "pause") {
      element.pause();
      return;
    }
    // И «звук», и «смотреть» включают звук: касание — это жест, после него
    // браузер звук разрешает.
    onSound(true);
    element.muted = false;
    if (action === "play") {
      const started: unknown = element.play();
      if (started instanceof Promise) started.catch(() => undefined);
    }
  }

  return (
    <article
      ref={ref}
      aria-posinset={position}
      aria-setsize={total}
      aria-label={video.title || video.categoryTitle || "Видео"}
      className="relative h-full w-full snap-start snap-always"
    >
      <button
        type="button"
        onClick={tap}
        aria-label={videoTapLabel(action, video.title)}
        className="absolute inset-0 block h-full w-full"
      >
        <video
          ref={videoRef}
          src={video.url}
          muted={!soundOn}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          className="h-full w-full object-contain"
        />
        {paused && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-black/50">
              <Play className="size-8 translate-x-0.5" aria-hidden />
            </span>
          </span>
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-16">
        <div className="min-w-0">
          {video.title && (
            <p className="line-clamp-2 text-base font-semibold drop-shadow">
              {video.title}
            </p>
          )}
          {video.categoryTitle && (
            <Link
              href={reelsHref({ tab: "video", category: video.category })}
              className="pointer-events-auto mt-1 inline-flex min-h-8 items-center rounded-full border border-white/30 bg-black/40 px-3 text-xs font-medium hover:bg-black/60"
            >
              {video.categoryTitle}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSound(!soundOn)}
          aria-pressed={soundOn}
          aria-label={soundOn ? "Выключить звук" : "Включить звук"}
          className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
        >
          {soundOn ? (
            <Volume2 className="size-5" aria-hidden />
          ) : (
            <VolumeX className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </article>
  );
}
