import * as cheerio from "cheerio";

import { sanitizeSourceHtml } from "./sanitize.js";
import { assertAllowedSourceUrl } from "./source-policy.js";

interface HtmlSelection {
  html(): string | null;
}

interface FindSelection {
  find(selector: string): { first(): HtmlSelection };
}

export interface ParsedSourcePage {
  title: string;
  sourceUrl: string;
  originalHtml?: string;
  transliterationHtml?: string;
  synonymsHtml?: string;
  translationHtml?: string;
  purportHtml?: string;
  bodyHtml?: string;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizedInnerHtml(element: HtmlSelection): string | undefined {
  const sanitized = sanitizeSourceHtml(element.html() ?? "");
  return sanitized || undefined;
}

function firstPart(
  root: FindSelection,
  selector: string,
): string | undefined {
  return sanitizedInnerHtml(root.find(selector).first());
}

export function parseSourcePage(html: string): ParsedSourcePage {
  const $ = cheerio.load(html);
  $("#next-contents").remove();

  const canonicalHref = $("link[rel~='canonical']").first().attr("href")?.trim();
  if (!canonicalHref) {
    throw new Error("Source page canonical URL is required");
  }

  let canonicalUrl: URL;
  try {
    canonicalUrl = new URL(canonicalHref);
    assertAllowedSourceUrl(canonicalUrl);
  } catch (error) {
    throw new Error("Source page canonical URL is invalid", { cause: error });
  }

  const title = normalizedText(
    $("#content h1").first().text() || $("head title").first().text(),
  );
  if (!title) {
    throw new Error("Source page title is required");
  }

  const parsed: ParsedSourcePage = {
    title,
    sourceUrl: canonicalUrl.href,
  };
  const verseBlock = $("#content #verse-block").first();

  if (verseBlock.length > 0) {
    const parts = {
      originalHtml: firstPart(verseBlock, ".verse-text"),
      transliterationHtml: firstPart(verseBlock, ".verse-transcription"),
      synonymsHtml: firstPart(verseBlock, ".verse-synonyms"),
      translationHtml: firstPart(verseBlock, ".verse-translation"),
      purportHtml: firstPart(verseBlock, ".verse-purport"),
    };

    for (const [key, value] of Object.entries(parts)) {
      if (value) {
        parsed[key as keyof typeof parts] = value;
      }
    }
    return parsed;
  }

  const proseBlocks = $("#content .general-purport")
    .toArray()
    .map((element) => sanitizedInnerHtml($(element)))
    .filter((value): value is string => Boolean(value));
  if (proseBlocks.length > 0) {
    parsed.bodyHtml = proseBlocks.join("\n");
  }

  return parsed;
}
