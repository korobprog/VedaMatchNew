"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  EyeOff,
  PenLine,
  Play,
  Rows3,
  Settings2,
  Share2,
  Square,
  Star,
  Volume2,
} from "lucide-react";
import type { BlogHomeFeedResponse, BlogPostDto } from "@vedamatch/shared";
import {
  BLOG_HOME_COOKIE,
  BLOG_HOME_COOKIE_MAX_AGE,
  serializeBlogHomeVisible,
} from "@/lib/blog-home-visibility";
import { BlogApiError, fetchBlogFavorites } from "@/lib/blog-client-api";
import {
  VCALENDAR_URL,
  getVcalendarButtonServerSnapshot,
  getVcalendarButtonSnapshot,
  subscribeVcalendarButton,
} from "@/lib/vcalendar-button";
import { BlogCarousel, BlogFrame } from "./blog-carousel";
import { blogHomeSlide, type BlogHomeSlide } from "./blog-media-list";
import {
  buildSpokenPost,
  canSpeak,
  getBlogSpeakingId,
  getBlogSpeakingServerId,
  speakBlogPost,
  stopBlogSpeech,
  subscribeBlogSpeech,
} from "./blog-speech";
import {
  HOME_PANEL_DEFAULT_ORDER,
  HOME_PANEL_LABELS,
  movePanelButton,
  readPanelOrder,
  writePanelOrder,
  type HomePanelButton,
} from "./home-panel-order";

const subscribeNothing = () => () => {};

/**
 * Блог-лента на главной (VED-238) — на месте, где раньше стояли карточка
 * поддержки и строка поиска.
 *
 * «Вид блог-ленты на главной — верхняя панель, картинка, заголовок. Всё»
 * (чек-лист карточки). Поэтому:
 *
 * - картинка во всю ширину виджета и целиком, без обрезки: посты листаются
 *   каруселью по одному, как в Instagram, а не мелкой плиткой;
 * - под картинкой только заголовок: ни автора, ни даты — они «сжирают место»
 *   и остаются в развороте поста;
 * - «вся лента и прошлые посты» — не надпись снизу, а кнопка в верхней
 *   панели рядом с «написать» и «скрыть», и там же четвёртая — «Избранное»;
 * - нажатие на картинку или заголовок открывает этот пост, а не ленту.
 *
 * Кнопка «Скрыть» пишет cookie и перерисовывает главную на сервере: в
 * спрятанном виде виджета нет вовсе, и главная выглядит как раньше. Вернуть
 * ленту можно кнопкой в строке настроек над сеткой сервисов.
 */
export function BlogHomeWidget({
  data,
  userId,
  className,
}: {
  data: BlogHomeFeedResponse;
  userId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * «Избранное» переключает содержимое виджета на отмеченные посты, а не
   * уводит со страницы: «чтобы они отображались в ленте по нажатии на неё».
   * Загружается при первом нажатии — главной незачем тянуть его заранее.
   */
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<BlogPostDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* «Вайшнавский календарь» (VED-489) — в свободном месте панели, у всех
     по умолчанию; спрятать можно в меню горячей кнопки «Календарь». */
  const showCalendar = useSyncExternalStore(
    subscribeVcalendarButton,
    getVcalendarButtonSnapshot,
    getVcalendarButtonServerSnapshot,
  );

  function hide() {
    document.cookie = `${BLOG_HOME_COOKIE}=${serializeBlogHomeVisible(
      userId,
      false,
    )}; path=/; max-age=${BLOG_HOME_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  async function toggleFavorites() {
    const next = !showFavorites;
    setShowFavorites(next);
    setError(null);
    if (!next || favorites !== null) return;
    setLoading(true);
    try {
      setFavorites((await fetchBlogFavorites()).posts);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError
          ? cause.message
          : "Не удалось загрузить избранное.",
      );
    } finally {
      setLoading(false);
    }
  }

  const posts = useMemo(
    () => (showFavorites ? (favorites ?? []) : data.posts),
    [showFavorites, favorites, data.posts],
  );
  const slides = useMemo(() => posts.map(blogHomeSlide), [posts]);

  /* Какой пост на экране — «Поделиться» и «Озвучить» (VED-497) работают с
     ним. Смена ленты (избранное) пересоздаёт карусель, и она сообщит 0. */
  const [slideIndex, setSlideIndex] = useState(0);
  const onIndexChange = useCallback(
    (index: number) => setSlideIndex(index),
    [],
  );
  const currentPost = posts[Math.min(slideIndex, posts.length - 1)] ?? null;
  const spokenSource = currentPost
    ? (currentPost.repostOf ?? currentPost)
    : null;
  const spokenText = spokenSource ? buildSpokenPost(spokenSource) : "";

  const speakingId = useSyncExternalStore(
    subscribeBlogSpeech,
    getBlogSpeakingId,
    getBlogSpeakingServerId,
  );
  const canSpeakHere = useSyncExternalStore(
    subscribeNothing,
    canSpeak,
    () => false,
  );
  const speaking = currentPost !== null && speakingId === currentPost.id;

  const [order, setOrder] = useState<HomePanelButton[]>(() => [
    ...HOME_PANEL_DEFAULT_ORDER,
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Порядок с устройства — после гидрации, иначе разметка сервера и
  // браузера разойдётся.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только в браузере
    setOrder(readPanelOrder());
  }, []);
  function move(id: HomePanelButton, direction: -1 | 1) {
    const next = movePanelButton(order, id, direction);
    setOrder(next);
    writePanelOrder(next);
  }

  const [shared, setShared] = useState(false);
  async function share() {
    if (!currentPost) return;
    const url = `${window.location.origin}/blog/posts/${encodeURIComponent(currentPost.id)}`;
    const title = spokenSource?.title ?? "Блог-лента VedaMatch";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      // Человек закрыл окно «Поделиться» — это не ошибка.
    }
  }

  function toggleSpeak() {
    if (!currentPost) return;
    if (speaking) stopBlogSpeech();
    else speakBlogPost(currentPost.id, spokenText);
  }

  /* Кнопки панели стоят на равном расстоянии по всей ширине (VED-497), а
     надписи «Блог-лента» больше нет — она «занимала место». Название
     осталось для скринридера. На узком телефоне кнопки 36px, от 400 точек —
     40px: восемь штук по 44 в строку 360 точек не встают. */
  const iconButton =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-glass-brd text-text-1 min-[400px]:size-10";

  const buttons: Record<HomePanelButton, ReactNode> = {
    calendar: showCalendar ? (
      // Внешний сайт: `noopener`, чтобы вкладка не получила доступ к
      // нашей через `window.opener`.
      <a
        href={VCALENDAR_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Вайшнавский календарь (vcalendar.ru, откроется в новой вкладке)"
        title="Вайшнавский календарь: экадаши, посты и дни явления"
        className={`${iconButton} hover:border-cyan/60`}
      >
        <CalendarDays aria-hidden className="size-4" />
      </a>
    ) : null,
    write: (
      <Link
        href="/blog?new=1"
        aria-label="Написать пост"
        title="Написать пост"
        className={`${iconButton} hover:border-cyan/60`}
      >
        <PenLine aria-hidden className="size-4" />
      </Link>
    ),
    feed: (
      <Link
        href="/blog"
        aria-label="Вся лента и прошлые посты"
        title="Вся лента и прошлые посты"
        className={`${iconButton} hover:border-cyan/60`}
      >
        <Rows3 aria-hidden className="size-4" />
      </Link>
    ),
    favorites: (
      <button
        type="button"
        onClick={toggleFavorites}
        aria-pressed={showFavorites}
        aria-label="Избранное"
        title="Избранное"
        className={`${iconButton} hover:border-gold/60 ${
          showFavorites ? "border-gold" : ""
        }`}
      >
        <Star
          aria-hidden
          className={`size-4 ${showFavorites ? "fill-gold text-gold" : ""}`}
        />
      </button>
    ),
    share: (
      <button
        type="button"
        onClick={() => void share()}
        disabled={!currentPost}
        aria-label={shared ? "Ссылка на пост скопирована" : "Поделиться постом"}
        title="Поделиться постом"
        className={`${iconButton} hover:border-cyan/60 disabled:opacity-50`}
      >
        {shared ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Share2 aria-hidden className="size-4" />
        )}
      </button>
    ),
    speak:
      canSpeakHere && spokenText ? (
        <button
          type="button"
          onClick={toggleSpeak}
          aria-pressed={speaking}
          aria-label={speaking ? "Остановить озвучку" : "Озвучить пост"}
          title={speaking ? "Остановить озвучку" : "Озвучить пост"}
          className={`${iconButton} hover:border-cyan/60 ${speaking ? "border-cyan" : ""}`}
        >
          {speaking ? (
            <Square aria-hidden className="size-3.5" fill="currentColor" />
          ) : (
            <Volume2 aria-hidden className="size-4" />
          )}
        </button>
      ) : null,
    hide: (
      <button
        type="button"
        onClick={hide}
        disabled={pending}
        aria-label="Убрать ленту с экрана"
        title="Убрать ленту с экрана"
        className={`${iconButton} hover:border-magenta/60 disabled:opacity-60`}
      >
        <EyeOff aria-hidden className="size-4" />
      </button>
    ),
  };

  return (
    <section
      aria-labelledby="blog-home-heading"
      className={`overflow-hidden rounded-2xl border border-glass-brd bg-glass ${className ?? ""}`}
    >
      <h2 id="blog-home-heading" className="sr-only">
        {showFavorites ? "Избранное Блог-ленты" : "Блог-лента"}
      </h2>
      <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
        {order.map((id) =>
          buttons[id] ? <Fragment key={id}>{buttons[id]}</Fragment> : null,
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls="blog-home-settings"
          aria-label="Настройки панели: порядок кнопок"
          title="Порядок кнопок"
          className={`${iconButton} hover:border-cyan/60 ${settingsOpen ? "border-cyan" : ""}`}
        >
          <Settings2 aria-hidden className="size-4" />
        </button>
      </div>

      {settingsOpen && (
        <div
          id="blog-home-settings"
          className="mx-1.5 mb-2 rounded-xl border border-glass-brd bg-bg-1 p-2"
        >
          <p className="px-1 pb-1 text-xs text-text-1">
            Порядок кнопок — стрелками. Кнопку календаря можно спрятать в меню
            горячей кнопки «Календарь».
          </p>
          <ol className="flex flex-col">
            {order.map((id, at) => (
              <li key={id} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate px-1 text-sm text-text-0">
                  {HOME_PANEL_LABELS[id]}
                </span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={at === 0}
                  aria-label={`${HOME_PANEL_LABELS[id]}: левее`}
                  className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ChevronUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={at === order.length - 1}
                  aria-label={`${HOME_PANEL_LABELS[id]}: правее`}
                  className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ChevronDown aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Итог переключения — вслух: содержимое виджета сменилось на месте. */}
      <p role="status" className="sr-only">
        {showFavorites && !loading && favorites
          ? `Избранное: ${favorites.length}`
          : ""}
      </p>

      {error ? (
        <p role="alert" className="px-3 pb-3 text-xs text-magenta">
          {error}
        </p>
      ) : loading ? (
        <p className="px-3 pb-3 text-sm text-text-1">Загружаю избранное…</p>
      ) : slides.length === 0 ? (
        <Link
          href={showFavorites ? "/blog" : "/blog?new=1"}
          className="mx-3 mb-3 block rounded-xl border border-glass-brd bg-bg-1 px-3 py-4 text-sm text-text-1"
        >
          {showFavorites
            ? "В избранном пока пусто. Отметьте пост звёздочкой в ленте — он появится здесь."
            : "В ленте пока пусто. Напишите первый пост — его увидят все."}
        </Link>
      ) : (
        <BlogCarousel
          key={showFavorites ? "favorites" : "feed"}
          count={slides.length}
          label={showFavorites ? "Избранные посты" : "Посты блог-ленты"}
          perView="responsive"
          fitHeight
          renderSlide={(index) => <HomeSlide slide={slides[index]} />}
          onIndexChange={onIndexChange}
        />
      )}
    </section>
  );
}

/**
 * Картинка и заголовок — одной ссылкой на пост: один переход по Tab на
 * слайд, и нажатие куда угодно по нему открывает тот же разворот.
 *
 * Заголовок под картинкой, а не поверх неё: картинку «должно быть видно
 * полностью». Рамка — по пропорции самого снимка (VED-443): в рамке первого
 * поста горизонтальный снимок соседа сжимался и обрастал полями. Строка
 * заголовка — только когда он есть (VED-441): пустая полоса под картинкой
 * «сжирала место на главном экране».
 */
function HomeSlide({ slide }: { slide: BlogHomeSlide }) {
  return (
    <Link
      href={`/blog/posts/${encodeURIComponent(slide.id)}`}
      /* Обводка фокуса — на слое поверх слайда, а не на самой ссылке:
         рамка картинки позиционирована и рисуется поверх обводки родителя,
         и та пропадала бы целиком под снимком. Замена, а не отключение:
         обводка та же, что у глобального `*:focus-visible`. */
      className="group relative block focus-visible:outline-none after:pointer-events-none after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-[-4px] focus-visible:after:outline-magenta focus-visible:after:outline-solid"
    >
      <BlogFrame aspect={slide.coverUrl ? slide.aspect : 1}>
        {slide.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.coverUrl}
            alt=""
            className="size-full object-contain"
          />
        ) : (
          <span className="flex size-full items-center justify-center px-6 text-center text-sm leading-6 text-text-1">
            {slide.frameText}
          </span>
        )}
        {slide.isVideo && (
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg-0/85 text-text-0"
          >
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        )}
      </BlogFrame>
      {slide.title && (
        <span className="flex min-h-14 items-center px-3 py-2">
          <span className="line-clamp-2 font-display text-sm font-semibold leading-snug text-text-0 group-hover:underline">
            {slide.title}
          </span>
        </span>
      )}
      {/* У ссылки обязано быть имя: пост из одной фотографии без слов
          иначе читается скринридером как пустая ссылка. */}
      <span className="sr-only">
        {slide.title
          ? slide.isVideo
            ? ", ролик"
            : ""
          : slide.coverUrl
            ? slide.isVideo
              ? "Пост с роликом"
              : "Пост с фотографией"
            : ""}
      </span>
    </Link>
  );
}
