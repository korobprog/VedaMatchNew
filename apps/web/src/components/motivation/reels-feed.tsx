"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  DonationSettingsDto,
  MotivationFeedResponse,
  MotivationLikeResponse,
  MotivationPostDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { DonateButton } from "@/components/donate-sheet";
import { splitQuoteAndExplanation } from "./quote-text";
import { ReportDialog } from "./report-dialog";
import {
  attributionLine,
  formatCount,
  mediaKindOf,
  seenDividerIndex,
  shareUrlFor,
  shouldLoadMore,
  viewDelayMs,
} from "./reels";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ReelsTab = "forYou" | "saved";

/**
 * Вертикальная лента по одному посту на экран: свайп вверх — следующий,
 * справа рельс действий, снизу цитата с источником. Активным считается слайд,
 * занявший больше половины окна: только он играет видео и только он
 * засчитывается как просмотр, когда продержался на экране секунду-две.
 *
 * Порядок слайдов приходит с сервера («свежее → непросмотренное → повтор»);
 * перед первым повтором лента ставит разделитель, а в конце — финальный слайд.
 */
export function ReelsFeed({
  initial,
  tab,
  donation,
}: {
  initial: MotivationFeedResponse;
  tab: ReelsTab;
  donation: DonationSettingsDto | null;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [activeIndex, setActiveIndex] = useState(0);
  // Что сейчас на экране: пост или служебный слайд. Ряд кнопок общий на всю
  // ленту, и на разделителе ему действовать не над чем.
  const [onPost, setOnPost] = useState(false);
  const [shared, setShared] = useState(false);
  /**
   * Звук один на всю ленту, а не на слайд: включив его один раз, человек
   * ожидает слышать и следующие ролики. Стартуем без звука — с ним браузер
   * просто не даст автозапуск.
   */
  const [soundOn, setSoundOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<Slide[]>([]);
  const viewedRef = useRef<Set<string>>(new Set());

  const dividerAt = useMemo(() => seenDividerIndex(items), [items]);

  const loadMore = useCallback(async () => {
    if (!cursor || pending) return;
    setPending(true);
    setError(null);
    try {
      const query = new URLSearchParams({ cursor });
      if (tab === "saved") query.set("filter", "favorites");
      const response = await apiFetch(`${API_URL}/motivation/feed?${query}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      const page = (await response.json()) as MotivationFeedResponse;
      setItems((current) => {
        const ids = new Set(current.map((post) => post.id));
        return [...current, ...page.items.filter((post) => !ids.has(post.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      setError("Не удалось загрузить следующие публикации");
    } finally {
      setPending(false);
    }
  }, [cursor, pending, tab]);

  // Подгрузка запускается из обработчика активации слайда, а не из эффекта:
  // так setState не каскадирует, а момент тот же — человек долистал до конца.
  function activate(index: number) {
    setActiveIndex(index);
    if (shouldLoadMore(index, items.length, Boolean(cursor))) void loadMore();
  }

  // Просмотр: активный слайд, продержавшийся положенное время. Один раз на
  // пост за сессию — повторные пролистывания сервер и так не учитывает.
  useEffect(() => {
    const post = items[activeIndex];
    if (!post || viewedRef.current.has(post.id)) return;
    const timer = setTimeout(() => {
      viewedRef.current.add(post.id);
      void apiFetch(`${API_URL}/motivation/posts/${post.id}/view`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    }, viewDelayMs(mediaKindOf(post)));
    return () => clearTimeout(timer);
  }, [activeIndex, items]);

  /**
   * Что сейчас на экране. Наблюдатель стоит только на постах, а ряд кнопок
   * должен прятаться и на разделителе, и на финальном слайде — поэтому тип
   * считаем по прокрутке контейнера.
   */
  const syncCurrentSlide = useCallback(() => {
    const box = containerRef.current;
    if (!box) return;
    // Высота нулевая, пока лента не измерена (первый кадр, тестовая среда):
    // тогда на экране первый слайд, а деление дало бы NaN.
    const index = box.clientHeight > 0 ? Math.round(box.scrollTop / box.clientHeight) : 0;
    const current = slidesRef.current[index];
    setOnPost(current?.kind === "post");
  }, []);

  // Состав слайдов колбэк прокрутки читает через ref; заодно пересчитываем
  // текущий слайд — лента может открыться сразу на разделителе.
  useEffect(() => {
    slidesRef.current = buildSlides(items, dividerAt, Boolean(cursor));
    syncCurrentSlide();
  }, [items, dividerAt, cursor, syncCurrentSlide]);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ top: direction * container.clientHeight, behavior: "smooth" });
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      scrollBy(1);
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      scrollBy(-1);
    }
  }

  function patchItem(id: string, patch: Partial<MotivationPostDto>) {
    setItems((current) => current.map((post) => (post.id === id ? { ...post, ...patch } : post)));
  }

  const activePost = items[activeIndex] ?? null;


  async function toggleLike() {
    if (!activePost) return;
    const post = activePost;
    const next = !post.isLiked;
    patchItem(post.id, { isLiked: next, likeCount: Math.max(0, post.likeCount + (next ? 1 : -1)) });
    try {
      const response = await apiFetch(`${API_URL}/motivation/posts/${post.id}/like`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      patchItem(post.id, (await response.json()) as MotivationLikeResponse);
    } catch {
      patchItem(post.id, { isLiked: !next, likeCount: post.likeCount });
    }
  }

  async function toggleFavorite() {
    if (!activePost) return;
    const post = activePost;
    const next = !post.isFavorite;
    patchItem(post.id, { isFavorite: next });
    try {
      const response = await apiFetch(`${API_URL}/motivation/posts/${post.id}/favorite`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
    } catch {
      patchItem(post.id, { isFavorite: !next });
    }
  }

  async function share() {
    if (!activePost) return;
    const url = shareUrlFor(activePost.slug, window.location.origin);
    try {
      if (navigator.share) {
        await navigator.share({ title: activePost.title, text: activePost.text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      // Человек закрыл системное окно — не ошибка.
    }
  }

  const slides = buildSlides(items, dividerAt, Boolean(cursor));


  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl bg-[#0A0614] p-8 text-center text-white">
        <p className="font-display text-lg">
          {tab === "saved" ? "В избранном пока пусто" : "Новые публикации скоро появятся"}
        </p>
        {tab === "saved" && (
          <Link href="/motivation" className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold">
            К ленте
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[28px] bg-[#0A0614] text-white shadow-2xl">
      {/* Прогресс по ленте — как в макете: тонкая полоса поверх кадра. */}
      <div className="absolute inset-x-0 top-0 z-30 h-[3px] bg-white/20" aria-hidden="true">
        <i
          className="block h-full bg-gradient-to-r from-mint to-white transition-[width] duration-300"
          style={{ width: `${items.length ? ((activeIndex + 1) / items.length) * 100 : 0}%` }}
        />
      </div>
      <Tabs tab={tab} />
      {/* Звук выключен, пока его не попросили: иначе лента заговорит сама,
          стоит открыть страницу. Кнопка живёт над слайдами — как и ряд
          действий внизу, она одна на всю ленту. У немого ролика её нет вовсе:
          нажимать было бы не на что. */}
      {activePost?.videoUrl && activePost.videoHasSound && (
        <button
          type="button"
          onClick={() => setSoundOn((value) => !value)}
          aria-pressed={soundOn}
          className="absolute right-3 top-16 z-30 rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
        >
          {soundOn ? "🔊 Звук включён" : "🔇 Включить звук"}
        </button>
      )}
      <div
        ref={containerRef}
        role="feed"
        aria-label="Лента мотивации"
        aria-busy={pending}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={syncCurrentSlide}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] focus:outline-none [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, position) => {
          if (slide.kind === "divider")
            return (
              <DividerSlide
                key="divider"
                first={position === 0}
                donation={donation}
                onNext={() => scrollBy(1)}
              />
            );
          if (slide.kind === "end")
            return <EndSlide key="end" donation={donation} tab={tab} error={error} onRetry={loadMore} />;
          return (
            <ReelSlide
              key={slide.post.id}
              post={slide.post}
              position={position}
              active={slide.index === activeIndex}
              soundOn={soundOn}
              onActive={() => activate(slide.index)}
            />
          );
        })}
      </div>

      {/* Ряд кнопок один на всю ленту и не едет со слайдом: раньше он был
          частью слайда и «подпрыгивал» при каждом свайпе. Фон стеклянный —
          сплошная чёрная плашка обрезала кадр. */}
      {activePost && onPost && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t border-white/15 bg-white/10 px-2 py-2 backdrop-blur-md">
          <RailButton
            label={activePost.isLiked ? "Убрать лайк" : "Нравится"}
            pressed={activePost.isLiked}
            caption={formatCount(activePost.likeCount)}
            onClick={toggleLike}
            accent="magenta"
          >
            <HeartIcon filled={activePost.isLiked} />
          </RailButton>
          <RailButton
            label={activePost.isFavorite ? "Убрать из избранного" : "Сохранить в избранное"}
            pressed={activePost.isFavorite}
            caption={activePost.isFavorite ? "Сохранено" : "Сохранить"}
            onClick={toggleFavorite}
            accent="gold"
          >
            <StarIcon filled={activePost.isFavorite} />
          </RailButton>
          <RailButton
            label="Поделиться"
            caption={shared ? "Скопировано" : "Поделиться"}
            onClick={share}
          >
            <ShareIcon />
          </RailButton>
          <Link
            href="/motivation/create"
            aria-label="Создать свой рилс"
            className="flex flex-col items-center gap-0.5 text-[10px] font-semibold drop-shadow"
          >
            <span className="btn-mint flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold leading-none">
              +
            </span>
            Создать
          </Link>
        </div>
      )}
    </div>
  );
}

/** Слайды ленты: посты плюс разделитель перед первым повтором и финал. */
function buildSlides(
  items: MotivationPostDto[],
  dividerAt: number,
  hasMore: boolean,
): Slide[] {
  const slides: Slide[] = [];
  items.forEach((post, index) => {
    if (index === dividerAt) slides.push({ kind: "divider" });
    slides.push({ kind: "post", post, index });
  });
  if (!hasMore) slides.push({ kind: "end" });
  return slides;
}

type Slide =
  | { kind: "post"; post: MotivationPostDto; index: number }
  | { kind: "divider" }
  | { kind: "end" };

function Tabs({ tab }: { tab: ReelsTab }) {
  const link = (key: ReelsTab | "mine", href: string, label: string) => (
    <Link
      key={key}
      href={href}
      aria-current={tab === key ? "page" : undefined}
      className={`px-1 pb-1 text-sm font-semibold drop-shadow ${
        tab === key ? "border-b-2 border-white text-white" : "text-white/65 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Вкладки ленты" className="absolute left-0 right-0 top-4 z-20 flex justify-center gap-5">
      {link("forYou", "/motivation", "Для вас")}
      {link("saved", "/motivation?tab=saved", "Избранное")}
      {link("mine", "/motivation/my", "Мои")}
    </nav>
  );
}

function ReelSlide({
  post,
  position,
  active,
  soundOn,
  onActive,
}: {
  post: MotivationPostDto;
  position: number;
  active: boolean;
  soundOn: boolean;
  onActive: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [paused, setPaused] = useState(false);
  const { quote, explanation } = splitQuoteAndExplanation(post.text);
  const kind = mediaKindOf(post);
  const source = attributionLine(post);

  // Колбэк в ref: родитель пересоздаёт его каждый рендер, а наблюдатель
  // должен жить один на слайд, иначе при каждом лайке он переподписывается.
  const onActiveRef = useRef(onActive);
  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onActiveRef.current();
      },
      { threshold: [0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Видео играет только на активном слайде и только если человек не просил
  // меньше движения; звук выключен — иначе браузер автоплей не даст.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sync = () => {
      if (active && !reduced && document.visibilityState === "visible") {
        // play() возвращает промис не везде (старые Safari, тестовая среда):
        // без проверки обработчик падал бы на .catch у undefined.
        const started: unknown = video.play();
        if (started instanceof Promise) started.catch(() => undefined);
      } else video.pause();
    };
    sync();
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    // Вкладка была свёрнута — play() отклонён; при возврате запускаем снова.
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [active]);

  // React выставляет `muted` только при монтировании, поэтому переключатель
  // звука доводим до элемента сами — иначе кнопка меняла бы лишь подпись.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = !soundOn;
  }, [soundOn]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const started: unknown = video.play();
      if (started instanceof Promise) started.catch(() => undefined);
    } else video.pause();
  }




  return (
    <article
      ref={ref}
      aria-label={post.title || quote}
      aria-posinset={position + 1}
      aria-setsize={-1}
      className="relative h-full w-full snap-start snap-always overflow-hidden"
    >
      {kind === "video" ? (
        // Обёртка задаёт зону ролика: у самого <video> ширина плюс собственные
        // пропорции пересчитали бы высоту и съели место под служебной строкой.
        // Кадр занимает весь слайд: полоса фона под роликом читалась как
        // чёрная дыра. Подпись и ряд кнопок лежат поверх — как в ленте у фото.
        <div className="absolute inset-0">
          {/* Поля вокруг кадра — размытая копия постера, как в больших лентах.
              Раньше ролик обрезался по бокам, и вместе с ним обрезалась
              вшитая подпись: на узком экране у цитаты пропадали первые буквы.
              Чёрные поля тоже не годились — их уже видели и просили убрать. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.storyImageUrl || post.imageUrl || undefined}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          />
          <video
            ref={videoRef}
            src={post.videoUrl}
            // Постер — сторис-кадр: подпись в нём уже есть, как и в самом ролике,
            // поэтому до загрузки видео слайд выглядит так же, как после.
            poster={post.storyImageUrl || post.imageUrl || undefined}
            muted={!soundOn}
            loop
            playsInline
            preload={active ? "auto" : "metadata"}
            // Кадр показывается целиком: подпись вшита у самого края, и любая
            // обрезка съедает её первыми.
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          loading={position < 2 ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* Подложка под текст. У ролика подпись вшита в кадр и уже стоит на своей
          подложке — наш слой лежал бы поверх неё и глушил белый до серого,
          поэтому для видео затемняем только край под чипами и шапкой. */}
      <div
        aria-hidden="true"
        className={
          kind === "video"
            ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.45)_0%,rgba(0,0,0,0)_18%)]"
            : "absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.45)_0%,rgba(0,0,0,0)_22%,rgba(0,0,0,0)_38%,rgba(10,6,20,.55)_62%,rgba(10,6,20,.86)_82%,rgba(10,6,20,.95)_100%)]"
        }
      />

      {kind === "video" && (
        // Тап по кадру ставит ролик на паузу и обратно; значок появляется
        // только на паузе — как в макете, где он показан над остановленным видео.
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? "Воспроизвести" : "Пауза"}
          className="absolute inset-x-0 bottom-20 top-16 z-[5] flex items-center justify-center focus-visible:outline-none"
        >
          {paused && (
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-black/35 text-xl backdrop-blur">
              ▶
            </span>
          )}
        </button>
      )}


      {/* Служебная строка стоит над рядом кнопок и, у ролика, под его кадром. */}
      <div className="absolute bottom-[4.5rem] left-4 right-4 z-10">
        {/* В ролик подпись вшита воркером, и вторая копия поверх кадра
            наезжала бы на первую. Для фото текст рисуем мы. */}
        {kind === "image" && (
          <p className="font-display text-[17px] font-medium leading-snug drop-shadow-md">{quote}</p>
        )}
        {kind === "image" && source && (
          <p className="mt-2 text-xs text-white/85">
            <span aria-hidden="true">📖 </span>
            {post.attributionSourceUrl ? (
              <a href={post.attributionSourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-4">
                {source}
              </a>
            ) : (
              source
            )}
            {post.sourceVerified && (
              <span className="ml-2 whitespace-nowrap text-[#9CF7E2]">· источник проверен</span>
            )}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
          {explanation && (
            <button
              type="button"
              aria-expanded={showExplanation}
              onClick={() => setShowExplanation((value) => !value)}
              className="underline-offset-4 hover:underline"
            >
              {showExplanation ? "Скрыть пояснение" : "Пояснение — нажмите, чтобы раскрыть ›"}
            </button>
          )}
          {post.origin === "user" && !post.isOwn && <ReportDialog postId={post.id} />}
        </div>
        {/* У ролика подпись не дублируем: авторство и источник воркер вшивает
            в сам кадр, а вторая строка поверх закрывала бы конец цитаты. */}
        {kind === "image" && <Byline post={post} />}
      </div>

      {showExplanation && explanation && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-[#1B0F2E]/95 p-5 text-sm leading-6 text-white/90 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-sm">Пояснение</span>
            <button type="button" onClick={() => setShowExplanation(false)} className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10">
              Закрыть
            </button>
          </div>
          <p className="whitespace-pre-line">{explanation}</p>
        </div>
      )}
    </article>
  );
}

/**
 * Кто принёс пост: редакция или участник. У участника — имя и метка
 * проверенного источника, у редакции — подпись сервиса, как в макете.
 */
function Byline({ post }: { post: MotivationPostDto }) {
  const mine = post.origin === "user";
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-white/85">
      <span
        aria-hidden="true"
        className={`h-6 w-6 flex-none rounded-full border-[1.5px] border-white ${
          mine ? "bg-gradient-to-br from-[#23F0C7] to-[#0B826F]" : "bg-gradient-to-br from-[#FF3E9E] to-[#FFC85C]"
        }`}
      />
      <span className="truncate">
        {mine ? `${post.author?.name ?? "Участник"} · рилс участника` : "VedaMatch · ежедневная"}
      </span>
      {mine && post.sourceVerified && (
        <span className="ml-auto flex-none rounded-full border border-[#23F0C7]/50 bg-[#23F0C7]/20 px-2 py-0.5 text-[10px] font-bold text-[#9CF7E2]">
          ✓ проверено
        </span>
      )}
    </div>
  );
}

function RailButton({
  label,
  caption,
  pressed,
  accent,
  onClick,
  children,
}: {
  label: string;
  caption: string;
  pressed?: boolean;
  accent?: "magenta" | "gold";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    pressed && accent === "magenta"
      ? "bg-[#FF3E9E] border-[#FF3E9E]"
      : pressed && accent === "gold"
        ? "bg-[#FFC85C] border-[#FFC85C] text-[#180F2C]"
        : "bg-white/15 border-white/25";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 text-[10px] font-semibold"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${activeClass}`}>
        {children}
      </span>
      <span aria-hidden="true">{caption}</span>
    </button>
  );
}

function DividerSlide({
  first,
  donation,
  onNext,
}: {
  /** Разделитель первым слайдом: нового не было вовсе, а не «кончилось». */
  first: boolean;
  donation: DonationSettingsDto | null;
  onNext: () => void;
}) {
  return (
    <section aria-label="Всё новое просмотрено" className="flex h-full w-full snap-start snap-always flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="font-display text-xl font-semibold">{first ? "Нового пока нет" : "Вы посмотрели всё новое"}</p>
      <p className="max-w-xs text-sm text-white/75">
        {first
          ? "Завтра появится пост дня. А пока — то, что вы уже видели, начиная с самого давнего."
          : "Дальше — публикации, которые вы уже видели, начиная с самых давних. Новое появится здесь при следующем открытии."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onNext} className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold">
          Листать дальше
        </button>
        <Link href="/motivation?tab=saved" className="rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10">
          Избранное
        </Link>
      </div>
      <DonateButton donation={donation} />
    </section>
  );
}

function EndSlide({
  donation,
  tab,
  error,
  onRetry,
}: {
  donation: DonationSettingsDto | null;
  tab: ReelsTab;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section aria-label="Конец ленты" className="flex h-full w-full snap-start snap-always flex-col items-center justify-center gap-4 px-8 text-center">
      {error ? (
        <>
          <p className="text-sm text-[#FFB4D9]">{error}</p>
          <button type="button" onClick={onRetry} className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold">
            Повторить
          </button>
        </>
      ) : (
        <>
          <p className="font-display text-xl font-semibold">{tab === "saved" ? "Это всё избранное" : "На сегодня это всё"}</p>
          <p className="max-w-xs text-sm text-white/75">
            Завтра появится новый пост дня. Настройте, сколько вайшнавской мудрости показывать, в настройках.
          </p>
          <Link href="/motivation/settings" className="rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10">
            Настройки ленты
          </Link>
          <DonateButton donation={donation} />
        </>
      )}
    </section>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.5 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
