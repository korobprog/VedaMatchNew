import type { MusicAudiobookKind } from "@vedamatch/shared";

/**
 * Разделы, устроенные как «Аудиокниги» (VED-437): «Аудиокниги» и «Лекции».
 * Страницы, плитка и редактор общие, различаются адресом и словами — они
 * собраны здесь, чтобы раздел нигде не назвался чужим именем.
 */
export interface AudiobookKindCopy {
  /** Название раздела: «Аудиокниги». */
  section: string;
  /** Адрес раздела без слеша в конце. */
  path: string;
  /** Единица раздела для числительного: книга / цикл лекций. */
  unit: [one: string, few: string, many: string];
  /** Часть единицы: глава / лекция. */
  part: [one: string, few: string, many: string];
  /** Заголовок списка частей на странице. */
  partsHeading: string;
  /** Вкладка админки. */
  adminPath: string;
  /** Подзаголовок раздела. */
  lead: string;
  /** Пустой раздел. */
  empty: string;
}

export const AUDIOBOOK_KIND_COPY: Record<
  MusicAudiobookKind,
  AudiobookKindCopy
> = {
  audiobook: {
    section: "Аудиокниги",
    path: "/music/audiobooks",
    unit: ["книга", "книги", "книг"],
    part: ["глава", "главы", "глав"],
    partsHeading: "Главы",
    adminPath: "/admin/music/audiobooks",
    lead: "Книги в записи. Главы идут по порядку, а плеер помнит, где вы остановились, — продолжить можно с того же места на любом устройстве.",
    empty:
      "Аудиокниг пока нет. Редакция собирает их в админке Музыки, во вкладке «Аудиокниги».",
  },
  lecture: {
    section: "Лекции",
    path: "/music/lectures",
    unit: ["цикл", "цикла", "циклов"],
    part: ["лекция", "лекции", "лекций"],
    partsHeading: "Лекции",
    adminPath: "/admin/music/lectures",
    lead: "Лекции и семинары в записи, собранные в циклы. Лекции идут по порядку, а плеер помнит, где вы остановились, — продолжить можно с того же места на любом устройстве.",
    empty:
      "Лекций пока нет. Редакция собирает их в админке Музыки, во вкладке «Лекции».",
  },
};

/** Адрес страницы цикла в его разделе. */
export function audiobookHref(kind: MusicAudiobookKind, slug: string): string {
  return `${AUDIOBOOK_KIND_COPY[kind].path}/${slug}`;
}
