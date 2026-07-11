import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseSitemap } from "../src/sitemap.js";

const fixtureUrl = new URL("./fixtures/sitemap.xml", import.meta.url);

test("parseSitemap filters origin and selection while preserving unique membership", async () => {
  const xml = await readFile(fixtureUrl, "utf8");

  const urls = parseSitemap(
    xml,
    new Set(["bhagavad-gita", "srimad-bhagavatam"]),
  );

  assert.deepEqual(
    urls.map((url) => url.href),
    [
      "https://vedabase.ru/bhagavad-gita/",
      "https://vedabase.ru/bhagavad-gita/1/",
      "https://vedabase.ru/srimad-bhagavatam/1/1/",
    ],
  );
});

test("parseSitemap ignores lastmod content and unselected books", async () => {
  const xml = await readFile(fixtureUrl, "utf8");

  const urls = parseSitemap(xml, new Set(["another-chance"]));

  assert.deepEqual(urls.map((url) => url.href), [
    "https://vedabase.ru/another-chance/",
  ]);
});
