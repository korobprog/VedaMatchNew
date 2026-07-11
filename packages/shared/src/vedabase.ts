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
