import { getServiceContent } from "@/lib/service-content";

/**
 * «Познакомиться с проектом» (VED-651): публичный туториал `/tour` —
 * главы с видео-презентациями. Видео готовятся отдельно: пока у главы нет
 * `videoUrl`, страница честно показывает «Видео готовится», а текст главы
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
  /** mp4 с голосом; `null` — видео ещё готовится. */
  videoUrl: string | null;
  /** Кадр до запуска видео; `null` — без обложки. */
  posterUrl: string | null;
  cta: { label: string; href: string };
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
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Все сервисы", href: "/#services" },
  },
  {
    id: "start",
    title: "Вход и профиль",
    text: "Вход — через аккаунт, который у вас уже есть, без отдельного пароля. После входа портал спросит несколько вещей о вас: имя, духовную линию и что вам интересно, — чтобы лента и рекомендации подходили именно вам.",
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Войти", href: "/login" },
  },
  {
    id: "union",
    title: "Знакомства",
    text: serviceText("union", "Знакомства для создания вайшнавской семьи."),
    videoUrl: null,
    posterUrl: null,
    cta: { label: "О Знакомствах", href: "/services/union" },
  },
  {
    id: "chat",
    title: "Общение",
    text: serviceText("chat", "Диалоги, группы и каналы общин."),
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Об Общении", href: "/services/chat" },
  },
  {
    id: "music",
    title: "Музыка и Радио",
    text: `${serviceText("music", "Киртаны, бхаджаны и записи с программ.")} Радио VedaMatch — общий эфир круглые сутки, его можно слушать даже без входа.`,
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Включить радио", href: "/radio" },
  },
  {
    id: "reading",
    title: "Вдохновение и Библиотека",
    text: `${serviceText("motivation", "Ежедневное вдохновение.")} ${serviceText("vedabase", "Библиотека книг.")}`,
    videoUrl: null,
    posterUrl: null,
    cta: { label: "О Вдохновении", href: "/services/motivation" },
  },
  {
    id: "app",
    title: "Приложение на телефон",
    text: "Всё то же самое — в телефоне: Android ставится файлом прямо с сайта, iPhone и iPad открывают веб-версию и добавляют её на экран «Домой».",
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Установить приложение", href: "/app" },
  },
];

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
