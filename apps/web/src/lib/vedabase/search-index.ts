import type {
  VedabaseChapterDocument,
  VedabaseReadingUnit,
} from "@vedamatch/shared";
import { vedabaseFileKey, openVedabaseDb } from "./local-db";
import { validateChapterDocument } from "./package-validator";

interface SearchHit {
  chapterSlug: string;
  unitId: string;
  field: string;
}

interface SearchPosting {
  token: string;
  hits: SearchHit[];
}

export interface VedabaseSearchResult {
  bookSlug: string;
  bookTitle: string;
  chapterSlug: string;
  chapterTitle: string;
  unitId: string;
  unitTitle: string;
  snippet: string;
}

export interface VedabaseSearchOptions {
  bookSlug?: string;
  limit?: number;
}

const searchableFields = [
  "title",
  "originalHtml",
  "transliterationHtml",
  "synonymsHtml",
  "translationHtml",
  "purportHtml",
  "bodyHtml",
] as const;

export function tokenizeSearchQuery(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export async function searchDownloadedBooks(
  userId: string,
  query: string,
  options: VedabaseSearchOptions = {},
): Promise<VedabaseSearchResult[]> {
  const tokens = [...new Set(tokenizeSearchQuery(query))];
  if (tokens.length === 0) return [];

  const database = await openVedabaseDb(userId);
  try {
    const books = (await database.getAll("library"))
      .filter((book) => !options.bookSlug || book.bookSlug === options.bookSlug)
      .sort((left, right) => left.manifest.title.localeCompare(right.manifest.title));
    const results: VedabaseSearchResult[] = [];
    const limit = Math.max(1, options.limit ?? 50);

    for (const book of books) {
      const storedIndex = await database.get(
        "files",
        vedabaseFileKey(book.bookSlug, book.activeVersion, "search-index.json"),
      );
      if (!storedIndex?.verified) continue;
      const postings = parseSearchIndex(storedIndex.body);
      const postingByToken = new Map(postings.map((posting) => [posting.token, posting]));
      const tokenPostings = tokens.map((token) => postingByToken.get(token));
      if (tokenPostings.some((posting) => !posting)) continue;

      const matches = intersectHits(tokenPostings as SearchPosting[]);
      for (const match of matches) {
        const chapterMeta = book.manifest.chapters.find(
          (chapter) => chapter.slug === match.chapterSlug,
        );
        if (!chapterMeta) continue;
        const storedChapter = await database.get(
          "files",
          vedabaseFileKey(book.bookSlug, book.activeVersion, chapterMeta.file),
        );
        if (!storedChapter?.verified) continue;
        const chapter = parseChapter(storedChapter.body);
        const unit = chapter.units.find((candidate) => candidate.id === match.unitId);
        if (!unit) continue;
        results.push({
          bookSlug: book.bookSlug,
          bookTitle: book.manifest.title,
          chapterSlug: chapter.slug,
          chapterTitle: chapter.title,
          unitId: unit.id,
          unitTitle: unit.title,
          snippet: buildSnippet(unit, tokens),
        });
        if (results.length >= limit) return results;
      }
    }

    return results;
  } finally {
    database.close();
  }
}

function intersectHits(postings: SearchPosting[]): Array<{
  chapterSlug: string;
  unitId: string;
}> {
  const keysFor = (posting: SearchPosting) =>
    new Set(posting.hits.map((hit) => hitKey(hit.chapterSlug, hit.unitId)));
  const [first, ...rest] = postings;
  if (!first) return [];
  const remaining = rest.map(keysFor);
  const unique = new Map<string, { chapterSlug: string; unitId: string }>();
  for (const hit of first.hits) {
    const key = hitKey(hit.chapterSlug, hit.unitId);
    if (remaining.every((set) => set.has(key))) {
      unique.set(key, { chapterSlug: hit.chapterSlug, unitId: hit.unitId });
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.chapterSlug.localeCompare(right.chapterSlug, undefined, { numeric: true }) ||
      left.unitId.localeCompare(right.unitId, undefined, { numeric: true }),
  );
}

function hitKey(chapterSlug: string, unitId: string): string {
  return `${chapterSlug}\u0000${unitId}`;
}

function parseSearchIndex(body: ArrayBuffer): SearchPosting[] {
  const value = JSON.parse(new TextDecoder().decode(body)) as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter(isSearchPosting);
}

function isSearchPosting(value: unknown): value is SearchPosting {
  return (
    isRecord(value) &&
    typeof value.token === "string" &&
    Array.isArray(value.hits) &&
    value.hits.every(
      (hit) =>
        isRecord(hit) &&
        typeof hit.chapterSlug === "string" &&
        typeof hit.unitId === "string" &&
        typeof hit.field === "string",
    )
  );
}

function parseChapter(body: ArrayBuffer): VedabaseChapterDocument {
  return validateChapterDocument(JSON.parse(new TextDecoder().decode(body)));
}

function buildSnippet(unit: VedabaseReadingUnit, tokens: string[]): string {
  const text = searchableFields
    .map((field) => {
      const value = unit[field];
      if (!value) return "";
      return field === "title" ? value : plainText(value);
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 180) return text;
  const normalized = text.normalize("NFKC").toLowerCase();
  const firstMatch = tokens.reduce((position, token) => {
    const index = normalized.indexOf(token);
    return index < 0 ? position : Math.min(position, index);
  }, Number.POSITIVE_INFINITY);
  const start = Number.isFinite(firstMatch) ? Math.max(0, firstMatch - 55) : 0;
  const end = Math.min(text.length, start + 180);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function plainText(html: string): string {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  documentValue.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
  return documentValue.body.textContent ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
