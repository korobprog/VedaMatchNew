import * as cheerio from "cheerio";

import type { GitabaseReadingUnit, VedabaseSearchDocument } from "@vedamatch/shared";

import { compareOrdinal } from "./toc.js";

export interface SearchHit {
  chapterSlug: string;
  unitId: string;
  field: string;
}

export interface SearchPosting {
  token: string;
  hits: SearchHit[];
}

export interface SearchChapter {
  chapterSlug: string;
  units: readonly GitabaseReadingUnit[];
}

const SEARCH_FIELDS = [
  "title",
  "originalHtml",
  "transliterationHtml",
  "synonymsHtml",
  "translationHtml",
  "purportHtml",
  "bodyHtml",
] as const;

function textFromField(field: string, value: string): string {
  return field === "title" ? value : cheerio.load(value, null, false).text();
}

export function tokenizeSearchText(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function compareHits(left: SearchHit, right: SearchHit): number {
  return (
    compareOrdinal(left.chapterSlug, right.chapterSlug) ||
    compareOrdinal(left.unitId, right.unitId) ||
    compareOrdinal(left.field, right.field)
  );
}

export function buildSearchIndex(
  chapters: readonly SearchChapter[],
): SearchPosting[] {
  const postings = new Map<string, SearchHit[]>();

  for (const chapter of chapters) {
    for (const unit of chapter.units) {
      for (const field of SEARCH_FIELDS) {
        const value = unit[field];
        if (!value) {
          continue;
        }
        const tokens = new Set(tokenizeSearchText(textFromField(field, value)));
        for (const token of tokens) {
          const hits = postings.get(token) ?? [];
          hits.push({
            chapterSlug: chapter.chapterSlug,
            unitId: unit.id,
            field,
          });
          postings.set(token, hits);
        }
      }
    }
  }

  return [...postings.entries()]
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([token, hits]) => ({ token, hits: hits.sort(compareHits) }));
}

export function serializeSearchIndex(postings: readonly SearchPosting[]): string {
  return `${JSON.stringify(postings, null, 2)}\n`;
}

export function buildSearchDocuments(bookSlug: string, chapters: readonly SearchChapter[]): VedabaseSearchDocument[] {
  const documents: VedabaseSearchDocument[] = [];
  for (const chapter of chapters) {
    for (const unit of chapter.units) {
      const text = SEARCH_FIELDS.flatMap((field) => {
        const value = unit[field];
        return value ? [textFromField(field, value)] : [];
      }).join("\n").trim();
      documents.push({
        locator: { bookSlug, chapterSlug: chapter.chapterSlug, unitId: unit.id },
        chapterSlug: chapter.chapterSlug,
        title: unit.title,
        text,
      });
    }
  }
  return documents;
}
