import { getServiceContent } from "@/lib/service-content";

/**
 * «Познакомиться с проектом» (VED-651): публичный туториал `/tour` —
 * главы с видео-презентациями. Видео готовятся отдельно: пока у главы нет
 * `video`, страница честно показывает «Видео готовится», а текст главы
 * работает и без него.
 *
 * Описания сервисов берутся из `service-content.ts` — те же слова, что на
 * страницах сервисов, чтобы туториал не расходился с ними после правки.
 */
export interface TourChapter {
  /** Якорь главы в адресе: `/tour#union`. */
  id: string;
  title: string;
  text: string;
  /** Видео-презентация главы с голосом — версии под телефон и компьютер. */
  video: TourVideo;
  /**
   * Рекламный текст под видео и то, что уходит вместе со ссылкой, когда
   * главой делятся. Есть только у глав с готовым видео: звать смотреть
   * заглушку «Видео готовится» незачем.
   */
  promo?: TourPromo;
  cta: { label: string; href: string };
}

export interface TourPromo {
  /** Абзац под видео — зачем смотреть и что даёт сервис. */
  text: string;
  /** Короткая подпись к ссылке в мессенджере. */
  share: string;
}

const NO_VIDEO: TourVideo = {
  desktopUrl: null,
  mobileUrl: null,
  posterUrl: null,
  mobilePosterUrl: null,
};

/**
 * Где лежат ролики тура: папка `tour/` бакета портала за прокси
 * media.vedamatch.ru — тем же адресом, что аватары и обложки. Файлы
 * кладёт workflow «Tour media» из вложений GitHub-релиза: в репозиторий
 * 15-мегабайтные mp4 не коммитим. Имя файла с версией (`-v1`), потому что
 * прокси и браузер кэшируют надолго: новый монтаж — новое имя.
 */
export const TOUR_MEDIA_BASE =
  "https://media.vedamatch.ru/05859cbd-c4799b8f-c25d-417d-b8a3-7c54ac14c436/tour";

function tourMedia(name: string): TourVideo {
  return {
    desktopUrl: `${TOUR_MEDIA_BASE}/${name}-16x9.mp4`,
    mobileUrl: `${TOUR_MEDIA_BASE}/${name}-9x16.mp4`,
    posterUrl: `${TOUR_MEDIA_BASE}/${name}-16x9.jpg`,
    mobilePosterUrl: `${TOUR_MEDIA_BASE}/${name}-9x16.jpg`,
  };
}

function serviceText(slug: string, fallback: string): string {
  const service = getServiceContent(slug);
  return service ? `${service.tagline}. ${service.description}` : fallback;
}

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: "about",
    title: "Что такое VedaMatch",
    text: "Портал для преданных: знакомства, общение, музыка, книги и вдохновение — в одном аккаунте. Сервисы связаны между собой, но каждым можно пользоваться отдельно.",
    video: NO_VIDEO,
    cta: { label: "Все сервисы", href: "/#services" },
  },
  {
    id: "start",
    title: "Вход и профиль",
    text: "Вход — через аккаунт, который у вас уже есть, без отдельного пароля. После входа портал спросит несколько вещей о вас: имя, духовную линию и что вам интересно, — чтобы лента и рекомендации подходили именно вам.",
    video: NO_VIDEO,
    cta: { label: "Войти", href: "/login" },
  },
  {
    id: "union",
    title: "Знакомства",
    text: serviceText("union", "Знакомства для создания вайшнавской семьи."),
    // Видео Знакомств (VED-653): 2:23, озвучка и музыка, снято на демо-анкетах.
    video: tourMedia("union-v1"),
    promo: {
      text: "Ищете спутника жизни, друзей по садхане или единомышленников для служения? В Знакомствах VedaMatch люди подбираются по целям, духовному этапу и ценностям — а процент совместимости честно объясняет, из чего сложился. Посмотрите двухминутное видео: фильтры, свайпы, взаимные симпатии и безопасность — всё, чтобы встретить своих.",
      share: "Знакомства VedaMatch — осознанные знакомства для преданных: совместимость по целям и ценностям, семья, дружба, служение. Двухминутное видео о том, как это работает:",
    },
    cta: { label: "О Знакомствах", href: "/services/union" },
  },
  {
    id: "chat",
    title: "Общение",
    text: serviceText("chat", "Диалоги, группы и каналы общин."),
    video: NO_VIDEO,
    cta: { label: "Об Общении", href: "/services/chat" },
  },
  {
    id: "music",
    title: "Музыка и Радио",
    text: `${serviceText("music", "Киртаны, бхаджаны и записи с программ.")} Радио VedaMatch — общий эфир круглые сутки, его можно слушать даже без входа.`,
    video: NO_VIDEO,
    cta: { label: "Включить радио", href: "/radio" },
  },
  {
    id: "reading",
    title: "Вдохновение и Библиотека",
    text: `${serviceText("motivation", "Ежедневное вдохновение.")} ${serviceText("vedabase", "Библиотека книг.")}`,
    video: NO_VIDEO,
    cta: { label: "О Вдохновении", href: "/services/motivation" },
  },
  {
    id: "app",
    title: "Приложение на телефон",
    text: "Всё то же самое — в телефоне: Android ставится файлом прямо с сайта, iPhone и iPad открывают веб-версию и добавляют её на экран «Домой».",
    video: NO_VIDEO,
    cta: { label: "Установить приложение", href: "/app" },
  },
];

/**
 * Видео главы — в двух версиях: вертикальная для телефона и горизонтальная
 * для компьютера. Пока адресов нет, на месте видео «Видео готовится».
 */
export interface TourVideo {
  /** Горизонтальное mp4 для компьютера; `null` — ещё нет. */
  desktopUrl: string | null;
  /** Вертикальное mp4 для телефона; `null` — ещё нет. */
  mobileUrl: string | null;
  /** Обложка горизонтальной версии (16:9); `null` — без обложки. */
  posterUrl: string | null;
  /** Обложка вертикальной версии (9:16); `null` — берётся горизонтальная. */
  mobilePosterUrl: string | null;
}

/** Экран, с которого показывать вертикальную версию. */
export const TOUR_MOBILE_QUERY = "(max-width: 767px)";

/**
 * Какую версию ставить: под экран, а если её пока нет — другую, лишь бы
 * человек увидел презентацию. `null` — видео нет вовсе.
 */
export function pickTourVideo(
  presentation: TourVideo,
  mobile: boolean,
): { url: string; vertical: boolean; poster: string | null } | null {
  const own = mobile ? presentation.mobileUrl : presentation.desktopUrl;
  const other = mobile ? presentation.desktopUrl : presentation.mobileUrl;
  const url = own ?? other;
  if (!url) return null;
  const vertical = own ? mobile : !mobile;
  // Обложка — в пропорциях той версии, что играет.
  const poster = vertical
    ? (presentation.mobilePosterUrl ?? presentation.posterUrl)
    : presentation.posterUrl;
  return { url, vertical, poster };
}

/**
 * Глава тура для значка «?» на странице сервиса (VED-651). Только у глав,
 * где видео обещано на странице сервиса, — сейчас это Знакомства.
 */
export const TOUR_SERVICE_HELP = new Set(["union"]);

export function tourHelpChapter(slug: string): TourChapter | null {
  if (!TOUR_SERVICE_HELP.has(slug)) return null;
  return TOUR_CHAPTERS.find((chapter) => chapter.id === slug) ?? null;
}

/** Глава по якорю адреса (`#union`); неизвестный или пустой — первая. */
export function tourChapterIndex(
  hash: string,
  chapters: readonly Pick<TourChapter, "id">[],
): number {
  const id = hash.replace(/^#/, "");
  const index = chapters.findIndex((chapter) => chapter.id === id);
  return index < 0 ? 0 : index;
}

/** Ключ просмотренных глав в `localStorage` — удобство одного браузера. */
export const TOUR_WATCHED_KEY = "vm-tour-watched";

/** Разбор сохранённого списка: мусор и чужие id отбрасываются. */
export function parseTourWatched(
  raw: string | null,
  chapters: readonly Pick<TourChapter, "id">[],
): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const known = new Set(chapters.map((chapter) => chapter.id));
    return value.filter(
      (id): id is string => typeof id === "string" && known.has(id),
    );
  } catch {
    return [];
  }
}
