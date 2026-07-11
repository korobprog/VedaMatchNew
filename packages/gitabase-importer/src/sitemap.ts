import * as cheerio from "cheerio";

import { assertAllowedSourceUrl } from "./source-policy.js";

export function parseSitemap(
  xml: string,
  selectedSlugs: Set<string>,
): URL[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: URL[] = [];
  const seenUrls = new Set<string>();

  $("loc").each((_index, element) => {
    const source = $(element).text().trim();
    let url: URL;

    try {
      url = new URL(source);
      assertAllowedSourceUrl(url);
    } catch {
      return;
    }

    const bookSlug = url.pathname.split("/")[1];
    if (!selectedSlugs.has(bookSlug) || seenUrls.has(url.href)) {
      return;
    }

    seenUrls.add(url.href);
    urls.push(url);
  });

  return urls;
}
