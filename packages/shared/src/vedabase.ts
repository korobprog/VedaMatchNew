export interface VedabasePackageFile {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export interface VedabaseLocator {
  bookSlug: string;
  chapterSlug: string;
  unitId: string;
  block?: string;
  start?: number;
  end?: number;
}

export interface VedabaseReadingUnit {
  id: string;
  title: string;
  sourceUrl: string;
  originalHtml?: string;
  transliterationHtml?: string;
  synonymsHtml?: string;
  translationHtml?: string;
  purportHtml?: string;
  bodyHtml?: string;
}

export interface VedabaseChapter {
  bookSlug: string;
  slug: string;
  title: string;
  order: number;
  units: VedabaseReadingUnit[];
}

export type VedabaseChapterDocument = VedabaseChapter;

export interface VedabaseBookManifest {
  formatVersion: 1;
  slug: string;
  title: string;
  author: string | null;
  language: "ru";
  contentVersion: string;
  packageChecksum: string;
  sizeBytes: number;
  coverPath: string | null;
  sourceUrl: string;
  sourceOrigin: "https://vedabase.ru";
  importedAt: string;
  permissionRef: string;
  attribution: string;
  chapters: Array<{ slug: string; title: string; order: number; file: string }>;
  files: VedabasePackageFile[];
  /**
   * Для кого книга (VED-662): ступени самоидентификации, пусто — для всех.
   * Необязательное: скачанные раньше пакеты его не несут.
   */
  audienceStages?: string[];
  /** Духовные линии книги (`LineageId`), пусто — для всех линий. */
  lineages?: string[];
}

/** Книга в админке Библиотеки (VED-662): разметка и блокировка. */
export interface VedabaseAdminBook {
  slug: string;
  title: string;
  author: string | null;
  kind: "scripture" | "teaching" | "biography" | "other";
  audienceStages: string[];
  lineages: string[];
  blocked: boolean;
  chapterCount: number;
  /** Есть ли у книги опубликованная версия текста. */
  active: boolean;
}

/** Правка книги админом: только переданные поля. */
export interface VedabaseAdminBookPatch {
  title?: string;
  author?: string | null;
  audienceStages?: string[];
  lineages?: string[];
  blocked?: boolean;
}

export interface VedabaseLibraryManifest {
  formatVersion: 1;
  generatedAt: string;
  books: VedabaseBookManifest[];
}

export type VedabaseImportStatus = "staging" | "validated" | "active" | "failed";

export interface VedabaseSearchDocument {
  locator: VedabaseLocator;
  chapterSlug: string;
  title: string;
  text: string;
}

export interface VedabaseSearchResult extends VedabaseSearchDocument {
  bookSlug: string;
  rank: number;
}

export const VEDABASE_BOOK_SLUGS = Object.freeze([
  "bhagavad-gita", "srimad-bhagavatam", "chaitanya-charitamrita",
  "nectar-devotion", "nectar-instructions", "isopanishad",
  "prabhupada-lilamrita", "raja-vidya", "light-bhagavata",
  "perfection-yoga", "path-perfection", "beyond-birth-death",
  "journey-krishna", "another-chance", "prayers-kunti",
] as const);

export type VedabaseBookSlug = (typeof VEDABASE_BOOK_SLUGS)[number];

export type VedabaseMutationEntity = "progress" | "bookmark" | "annotation";
export interface VedabaseClientMutation { clientMutationId: string; entity: VedabaseMutationEntity; entityId: string; baseRevision: number | null; payload: unknown; createdAt: string }
export interface VedabaseSyncPushRequest { mutations: VedabaseClientMutation[] }
export interface VedabaseSyncPushResponse { accepted: Array<{ clientMutationId: string; revision: number }>; cursor: string }
export interface VedabaseSyncPullResponse { changes: Array<{ entity: VedabaseMutationEntity; entityId: string; revision: number; payload: unknown }>; cursor: string }

/**
 * Файл книги Библиотеки для скачивания (VED-662, часть 3б). Та же форма и те
 * же правила заливки, что у файлов Образования: подписанный PUT мимо API.
 */
export type {
  LibraryEntryFileDto as VedabaseBookFileDto,
  CreateLibraryBookUploadRequest as CreateVedabaseBookUploadRequest,
  CompleteLibraryBookUploadRequest as CompleteVedabaseBookUploadRequest,
  LibraryBookUploadResponse as VedabaseBookUploadResponse,
} from "./library";

/**
 * Цветной перевод (VED-683): цвета, которыми админ красит слова. Названия, а
 * не hex: читалка подбирает оттенок под свою тему (день, пергамент, ночь).
 */
export const VEDABASE_COLORS = [
  "red",
  "orange",
  "gold",
  "green",
  "blue",
  "violet",
] as const;
export type VedabaseColor = (typeof VEDABASE_COLORS)[number];

/** Блоки стиха, которые можно раскрашивать. */
export const VEDABASE_COLOR_BLOCKS = ["transliterationHtml", "synonymsHtml"] as const;
export type VedabaseColorBlock = (typeof VEDABASE_COLOR_BLOCKS)[number];

/** Отрезок раскраски — смещения в тексте блока, как у выделений читателя. */
export interface VedabaseColorSpan {
  start: number;
  end: number;
  color: VedabaseColor;
}

/** Раскраска одного блока стиха. */
export interface VedabaseColoringDto {
  unitId: string;
  block: VedabaseColorBlock;
  spans: VedabaseColorSpan[];
}

/** Сохранение раскраски админом: пустой `spans` — снять раскраску. */
export interface SaveVedabaseColoringRequest extends VedabaseColoringDto {
  chapterSlug: string;
}
