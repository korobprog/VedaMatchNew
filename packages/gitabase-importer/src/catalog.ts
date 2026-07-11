export const VEDABASE_BOOK_SLUGS = Object.freeze([
  "bhagavad-gita", "srimad-bhagavatam", "chaitanya-charitamrita",
  "nectar-devotion", "nectar-instructions", "isopanishad",
  "prabhupada-lilamrita", "raja-vidya", "light-bhagavata",
  "perfection-yoga", "path-perfection", "beyond-birth-death",
  "journey-krishna", "another-chance", "prayers-kunti",
] as const);
export const GITABASE_BOOK_SLUGS = VEDABASE_BOOK_SLUGS;
export type VedabaseBookSlug = (typeof VEDABASE_BOOK_SLUGS)[number];
export type GitabaseBookSlug = VedabaseBookSlug;
