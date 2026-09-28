"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  EyeOff,
  Heart,
  Pause,
  Play,
  Plus,
  Rows3,
  Share2,
  Star,
  Volume2,
} from "lucide-react";
import type { BlogHomeFeedResponse, BlogPostDto } from "@vedamatch/shared";
import {
  BLOG_HOME_COOKIE,
  BLOG_HOME_COOKIE_MAX_AGE,
  serializeBlogHomeVisible,
} from "@/lib/blog-home-visibility";
import {
  BlogApiError,
  fetchBlogFavorites,
  setBlogLike,
} from "@/lib/blog-client-api";
import {
  VCALENDAR_URL,
  getVcalendarButtonServerSnapshot,
  getVcalendarButtonSnapshot,
  subscribeVcalendarButton,
} from "@/lib/vcalendar-button";
import { BlogCarousel } from "./blog-carousel";
import { BlogFitImage } from "./blog-fit-image";
import {
  BLOG_HOME_MAX_ASPECT,
  blogHomeSlide,
  type BlogHomeSlide,
} from "./blog-media-list";
import { useBlogSpeech } from "./blog-speak-button";
import { homeLikeOf, toggleHomeLike, type HomeLikeState } from "./home-like";
import { shareBlogPost } from "./blog-share";
import {
  HOME_PANEL_DEFAULT_ORDER,
  readPanelOrder,
  type HomePanelButton,
} from "./home-panel-order";

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
 *
 * Последняя кнопка панели — «Нравится» у поста на экране (VED-586), на
 * месте бывшей шестерёнки «Порядок кнопок». Порядок панели теперь меняется
 * на странице поста, в той же настройке, что и кнопки под постом.
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
     по умолчанию; спрятать можно в настройке горячих кнопок (VED-496). */
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
  /* Пост из Образования читается текстом материала, а не ссылкой (VED-550):
     источник выбирает `useBlogSpeech`. */
  const speakRef = useRef<HTMLButtonElement>(null);
  const speech = useBlogSpeech(currentPost?.id ?? null, spokenSource, speakRef);
  const { speaking, paused } = speech;

  const [order, setOrder] = useState<HomePanelButton[]>(() => [
    ...HOME_PANEL_DEFAULT_ORDER,
  ]);
  // Порядок с устройства — после гидрации, иначе разметка сервера и
  // браузера разойдётся.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только в браузере
    setOrder(readPanelOrder());
  }, []);

  /* «Нравится» (VED-586) — у поста на экране, тем же запросом, что под
     постом в ленте. Сердечко меняется сразу, а число после ответа берётся
     с сервера; отметки живут по id поста, поэтому переживают листание и
     переключение на избранное. */
  const [likes, setLikes] = useState<Record<string, HomeLikeState>>({});
  const like = currentPost ? homeLikeOf(currentPost, likes) : null;
  async function toggleLike() {
    if (!currentPost || !like) return;
    const id = currentPost.id;
    const next = toggleHomeLike(like);
    setLikes((all) => ({ ...all, [id]: next }));
    try {
      const saved = await setBlogLike(id, next.liked);
      setLikes((all) => ({ ...all, [id]: saved }));
    } catch {
      // Не вышло — сердечко возвращается как было.
      setLikes((all) => ({ ...all, [id]: like }));
    }
  }
  // Отметку сообщает `aria-pressed`, в имени — только число.
  const likeLabel =
    like && like.likeCount > 0 ? `Нравится: ${like.likeCount}` : "Нравится";

  const [shared, setShared] = useState(false);
  async function share() {
    if (!currentPost) return;
    const result = await shareBlogPost(
      { id: currentPost.id, title: spokenSource?.title },
      window.location.origin,
    );
    if (result !== "copied") return;
    setShared(true);
    window.setTimeout(() => setShared(false), 2000);
  }

  /* Второе нажатие — пауза, а не «стоп» (VED-514): третье продолжает с того
     же места, а не читает пост сначала. */
  const speakLabel = speaking
    ? "Пауза"
    : paused
      ? "Продолжить озвучку"
      : "Озвучить пост";

  /* Кнопки панели стоят на равном расстоянии по всей ширине (VED-497), а
     надписи «Блог-лента» больше нет — она «занимала место». Название
     осталось для скринридера. На узком телефоне кнопки 36px, от 400 точек —
     40px: восемь штук по 44 в строку 360 точек не встают. */
  const iconShape =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border min-[400px]:size-10";
  const iconButton = `${iconShape} border-glass-brd text-text-1`;

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
    /* «Написать пост» — плюсом, а не карандашом (VED-626): карандаш на
       портале означает «изменить». Цветом не выделяется (VED-630: «не надо
       выделять красным, сделай как остальные») — рамка и цвет как у
       соседей по ряду. */
    write: (
      <Link
        href="/blog?new=1"
        aria-label="Написать пост"
        title="Написать пост"
        className={`${iconButton} hover:border-cyan/60`}
      >
        <Plus aria-hidden className="size-4" />
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
    speak: speech.available ? (
      <button
        ref={speakRef}
        type="button"
        onClick={() => void speech.toggle()}
        disabled={speech.loading}
        aria-busy={speech.loading}
        aria-pressed={speaking}
        aria-label={speakLabel}
        title={speakLabel}
        className={`${iconButton} hover:border-cyan/60 ${speaking || paused ? "border-cyan" : ""}`}
      >
        {speaking ? (
          <Pause aria-hidden className="size-4" fill="currentColor" />
        ) : paused ? (
          <Play aria-hidden className="size-4" fill="currentColor" />
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
    like: (
      <button
        type="button"
        onClick={() => void toggleLike()}
        disabled={!currentPost}
        aria-pressed={like?.liked ?? false}
        aria-label={likeLabel}
        title={likeLabel}
        /* Лайк виден закрашенным сердцем, без розовой каёмки (VED-623). */
        className={`${iconButton} hover:border-magenta/60 disabled:opacity-50`}
      >
        <Heart
          aria-hidden
          className={`size-4 ${like?.liked ? "fill-magenta text-magenta" : ""}`}
        />
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
      </div>

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
function VideoMark() {
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg-0/85 text-text-0"
    >
      <Play className="ml-0.5 size-6 fill-current" />
    </span>
  );
}

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
      {/* Рамка — по пропорции самого снимка, без полей (VED-527); у
          обложки без размеров — по загруженному снимку. */}
      {slide.coverUrl ? (
        <BlogFitImage
          src={slide.coverUrl}
          alt=""
          width={
            slide.coverAspect ? Math.round(slide.coverAspect * 1000) : null
          }
          height={slide.coverAspect ? 1000 : null}
          maxAspect={BLOG_HOME_MAX_ASPECT}
        >
          {slide.isVideo && <VideoMark />}
        </BlogFitImage>
      ) : (
        /* Пост без картинки — по высоте текста, а не квадратом (VED-564):
           в квадрате короткий текст стоял посреди огромных пустых полей. */
        <span className="block bg-bg-2 px-6 py-5 text-center text-sm leading-6 text-text-1">
          {slide.frameText}
        </span>
      )}
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
