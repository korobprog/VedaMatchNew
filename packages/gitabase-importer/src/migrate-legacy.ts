import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import type {
  VedabaseBookManifest,
  VedabaseChapter,
  VedabaseReadingUnit,
  VedabaseSearchDocument,
} from "@vedamatch/shared";

import { DatabaseBookWriter, type ChapterWrite } from "./database-writer.js";

const BOOK_SLUGS = {
  ac: "another-chance",
  bbd: "beyond-birth-death",
  bg: "bhagavad-gita",
  cc: "chaitanya-charitamrita",
  iso: "isopanishad",
  jk: "journey-krishna",
  lob: "light-bhagavata",
  nod: "nectar-devotion",
  noi: "nectar-instructions",
  pk: "prayers-kunti",
  pl: "prabhupada-lilamrita",
  pp: "path-perfection",
  py: "perfection-yoga",
  rv: "raja-vidya",
  sb: "srimad-bhagavatam",
} as const;

interface LegacyBook {
  code: keyof typeof BOOK_SLUGS;
  name_ru: string;
}

interface LegacyVerse {
  book_code: keyof typeof BOOK_SLUGS;
  canto: number;
  chapter: number;
  verse: string;
  devanagari: string | null;
  transliteration: string | null;
  synonyms: string | null;
  translation: string | null;
  purport: string | null;
  source_url: string;
  verse_reference: string;
}

interface LegacyChapterTitle {
  book_code: keyof typeof BOOK_SLUGS;
  canto: number;
  chapter: number;
  title_ru: string;
}

const serialize = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

function textHtml(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return escaped.split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`).join("");
}

function chapterSlug(canto: number, chapter: number): string {
  return canto > 0 ? `${canto}-${chapter}` : String(chapter);
}

function readingUnit(row: LegacyVerse): VedabaseReadingUnit {
  return {
    id: sha256(`${row.book_code}:${row.canto}:${row.chapter}:${row.verse}`).slice(0, 24),
    title: row.verse_reference,
    sourceUrl: row.source_url,
    ...(textHtml(row.devanagari) ? { originalHtml: textHtml(row.devanagari) } : {}),
    ...(textHtml(row.transliteration) ? { transliterationHtml: textHtml(row.transliteration) } : {}),
    ...(textHtml(row.synonyms) ? { synonymsHtml: textHtml(row.synonyms) } : {}),
    ...(textHtml(row.translation) ? { translationHtml: textHtml(row.translation) } : {}),
    ...(textHtml(row.purport) ? { purportHtml: textHtml(row.purport) } : {}),
  };
}

function searchText(unit: VedabaseReadingUnit): string {
  return [unit.title, unit.originalHtml, unit.transliterationHtml, unit.synonymsHtml, unit.translationHtml, unit.purportHtml]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function migrateLegacyVedabase(sourceUrl: string, targetUrl: string): Promise<void> {
  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient({ datasourceUrl: targetUrl });
  const writer = new DatabaseBookWriter(target);
  try {
    const books = await source.$queryRawUnsafe<LegacyBook[]>(
      "SELECT code, name_ru FROM scripture_books ORDER BY id",
    );
    if (books.length !== 15) throw new Error(`Expected 15 legacy books, found ${books.length}`);
    for (const book of books) {
      const slug = BOOK_SLUGS[book.code];
      if (!slug) throw new Error(`Unsupported legacy book code: ${book.code}`);
      const rows = await source.$queryRawUnsafe<LegacyVerse[]>(
        `SELECT book_code, canto::int, chapter::int, verse, devanagari, transliteration, synonyms, translation, purport, source_url, verse_reference
         FROM scripture_verses WHERE book_code = $1 AND language = 'ru'
         ORDER BY canto, chapter, id`,
        book.code,
      );
      const titles = await source.$queryRawUnsafe<LegacyChapterTitle[]>(
        `SELECT book_code, canto::int, chapter::int, title_ru FROM scripture_chapters
         WHERE book_code = $1 ORDER BY canto, chapter`,
        book.code,
      );
      const titleMap = new Map(titles.map((item) => [`${item.canto}:${item.chapter}`, item.title_ru]));
      const grouped = new Map<string, LegacyVerse[]>();
      for (const row of rows) {
        const key = `${row.canto}:${row.chapter}`;
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
      }
      const chapters: VedabaseChapter[] = [...grouped.entries()].map(([key, chapterRows], order) => {
        const first = chapterRows[0]!;
        return {
          bookSlug: slug,
          slug: chapterSlug(first.canto, first.chapter),
          title: titleMap.get(key) ?? first.verse_reference,
          order,
          units: chapterRows.map(readingUnit),
        };
      });
      const chapterWrites: ChapterWrite[] = chapters.map((chapter) => {
        const content = serialize(chapter);
        return { chapter, bytes: content.byteLength, sha256: sha256(content) };
      });
      const searchDocuments: VedabaseSearchDocument[] = chapters.flatMap((chapter) =>
        chapter.units.map((unit) => ({
          locator: { bookSlug: slug, chapterSlug: chapter.slug, unitId: unit.id },
          chapterSlug: chapter.slug,
          title: unit.title,
          text: searchText(unit),
        })),
      );
      const searchContent = serialize(searchDocuments);
      const files = [
        ...chapterWrites.map(({ chapter, bytes, sha256: checksum }) => ({ path: `chapters/${chapter.slug}.json`, bytes, sha256: checksum, contentType: "application/json; charset=utf-8" })),
        { path: "search-index.json", bytes: searchContent.byteLength, sha256: sha256(searchContent), contentType: "application/json; charset=utf-8" },
      ].sort((left, right) => left.path.localeCompare(right.path));
      const packageChecksum = sha256(files.map((file) => `${file.path}:${file.bytes}:${file.sha256}`).join("\n"));
      const manifest: VedabaseBookManifest = {
        formatVersion: 1,
        slug,
        title: book.name_ru,
        author: "А. Ч. Бхактиведанта Свами Прабхупада",
        language: "ru",
        contentVersion: packageChecksum,
        packageChecksum,
        sizeBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        coverPath: null,
        sourceUrl: rows[0]?.source_url ?? `https://vedabase.ru/${book.code}/`,
        sourceOrigin: "https://vedabase.ru",
        importedAt: new Date().toISOString(),
        permissionRef: "VedaMatch owner-approved migration from legacy ragdb, 2026-07-11",
        attribution: "Source: vedabase.ru; migrated from the VedaMatch legacy database.",
        chapters: chapters.map(({ slug: chapter, title, order }) => ({ slug: chapter, title, order, file: `chapters/${chapter}.json` })),
        files,
      };
      const version = await writer.stage(manifest, true);
      await writer.writeChapterBatch(version.id, chapterWrites);
      await writer.writeSearchBatch(version.id, searchDocuments);
      await writer.validate(version.id);
      await writer.activate(version.id);
      console.log(`${slug}: ${chapters.length} chapters, ${rows.length} units`);
    }
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const sourceUrl = process.env.LEGACY_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error("LEGACY_DATABASE_URL and DATABASE_URL are required");
  migrateLegacyVedabase(sourceUrl, targetUrl).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
