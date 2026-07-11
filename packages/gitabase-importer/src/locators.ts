import { createHash } from "node:crypto";

import type { GitabaseLocator } from "@vedamatch/shared";

export function stableUnitId(sourceUrl: string): string {
  const canonicalUrl = new URL(sourceUrl).href;
  const digest = createHash("sha256").update(canonicalUrl).digest("hex");
  return `unit-${digest.slice(0, 24)}`;
}

export function createUnitLocator(
  bookSlug: string,
  chapterSlug: string,
  sourceUrl: string,
): GitabaseLocator {
  return {
    bookSlug,
    chapterSlug,
    unitId: stableUnitId(sourceUrl),
  };
}
