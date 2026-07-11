import { createHash } from "node:crypto";

import type {
  GitabaseBookManifest,
  GitabaseChapterDocument,
  GitabasePackageFile,
  GitabaseReadingUnit,
} from "@vedamatch/shared";

import { stableUnitId } from "./locators.js";
import type { ParsedSourcePage } from "./parse-page.js";
import { buildSearchDocuments, buildSearchIndex, serializeSearchIndex } from "./search-index.js";
import { compareNatural, compareOrdinal, sortBySourceUrl } from "./toc.js";
import {
  buildChecksumInput,
  computePackageChecksum,
  validateBookPackage,
} from "./validator.js";

export interface BuildBookPackageInput {
  slug: string;
  title: string;
  author: string | null;
  sourceUrl: string;
  importedAt: string;
  permissionRef: string;
  attribution: string;
  pages: readonly ParsedSourcePage[];
}

export interface BuiltBookPackage {
  manifest: GitabaseBookManifest;
  files: ReadonlyMap<string, Buffer>;
  checksumInput: string;
  chapters: GitabaseChapterDocument[];
  searchDocuments: import("@vedamatch/shared").VedabaseSearchDocument[];
}

function serializeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceSegments(sourceUrl: string, bookSlug: string): string[] {
  const segments = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  if (segments.shift() !== bookSlug) {
    throw new Error(`Source page is outside book ${bookSlug}: ${sourceUrl}`);
  }
  return segments;
}

function chapterSlugForPage(page: ParsedSourcePage, bookSlug: string): string {
  const segments = sourceSegments(page.sourceUrl, bookSlug);
  if (segments.length === 0) {
    return "index";
  }
  if (segments.length === 1) {
    return segments[0]!;
  }
  return segments.slice(0, -1).join("-");
}

function readingUnit(page: ParsedSourcePage): GitabaseReadingUnit {
  return {
    id: stableUnitId(page.sourceUrl),
    title: page.title,
    sourceUrl: page.sourceUrl,
    ...(page.originalHtml ? { originalHtml: page.originalHtml } : {}),
    ...(page.transliterationHtml
      ? { transliterationHtml: page.transliterationHtml }
      : {}),
    ...(page.synonymsHtml ? { synonymsHtml: page.synonymsHtml } : {}),
    ...(page.translationHtml ? { translationHtml: page.translationHtml } : {}),
    ...(page.purportHtml ? { purportHtml: page.purportHtml } : {}),
    ...(page.bodyHtml ? { bodyHtml: page.bodyHtml } : {}),
  };
}

export function buildBookPackage(
  input: BuildBookPackageInput,
): BuiltBookPackage {
  if (!input.permissionRef.trim() || !input.attribution.trim()) {
    throw new Error("Permission reference and attribution are required");
  }
  if (input.pages.length === 0) {
    throw new Error(`No source pages supplied for ${input.slug}`);
  }

  const seenSourceUrls = new Set<string>();
  const grouped = new Map<string, ParsedSourcePage[]>();
  for (const page of input.pages) {
    if (seenSourceUrls.has(page.sourceUrl)) {
      throw new Error(`Duplicate source page: ${page.sourceUrl}`);
    }
    seenSourceUrls.add(page.sourceUrl);
    const chapterSlug = chapterSlugForPage(page, input.slug);
    const pages = grouped.get(chapterSlug) ?? [];
    pages.push(page);
    grouped.set(chapterSlug, pages);
  }

  const chapterSlugs = [...grouped.keys()].sort(compareNatural);
  const chapterDocuments: GitabaseChapterDocument[] = chapterSlugs.map(
    (slug, order) => {
      const pages = sortBySourceUrl(grouped.get(slug)!);
      return {
        bookSlug: input.slug,
        slug,
        title: pages[0]!.title,
        order,
        units: pages.map(readingUnit),
      };
    },
  );

  const mutableFiles = new Map<string, Buffer>();
  for (const chapter of chapterDocuments) {
    mutableFiles.set(`chapters/${chapter.slug}.json`, serializeJson(chapter));
  }
  const searchIndex = buildSearchIndex(
    chapterDocuments.map((chapter) => ({
      chapterSlug: chapter.slug,
      units: chapter.units,
    })),
  );
  mutableFiles.set(
    "search-index.json",
    Buffer.from(serializeSearchIndex(searchIndex), "utf8"),
  );

  const packageFiles: GitabasePackageFile[] = [...mutableFiles.entries()]
    .map(([path, content]) => ({
      path,
      bytes: content.byteLength,
      sha256: sha256(content),
      contentType: "application/json; charset=utf-8",
    }))
    .sort((left, right) => compareOrdinal(left.path, right.path));
  const checksumInput = buildChecksumInput(packageFiles);
  const packageChecksum = computePackageChecksum(packageFiles);
  const manifest: GitabaseBookManifest = {
    formatVersion: 1,
    slug: input.slug,
    title: input.title,
    author: input.author,
    language: "ru",
    contentVersion: packageChecksum,
    packageChecksum,
    sizeBytes: packageFiles.reduce((total, file) => total + file.bytes, 0),
    coverPath: null,
    sourceUrl: input.sourceUrl,
    sourceOrigin: "https://vedabase.ru",
    importedAt: input.importedAt,
    permissionRef: input.permissionRef,
    attribution: input.attribution,
    chapters: chapterDocuments.map((chapter) => ({
      slug: chapter.slug,
      title: chapter.title,
      order: chapter.order,
      file: `chapters/${chapter.slug}.json`,
    })),
    files: packageFiles,
  };
  const built = { manifest, files: mutableFiles, checksumInput, chapters: chapterDocuments, searchDocuments: buildSearchDocuments(input.slug, chapterDocuments.map((chapter) => ({ chapterSlug: chapter.slug, units: chapter.units }))) };
  validateBookPackage(built);
  return built;
}
