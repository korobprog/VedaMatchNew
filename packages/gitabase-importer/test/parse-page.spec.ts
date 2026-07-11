import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseSourcePage } from "../src/parse-page.js";

const verseFixtureUrl = new URL(
  "./fixtures/verse-page-with-next-contents.html",
  import.meta.url,
);
const proseFixtureUrl = new URL(
  "./fixtures/prose-page-with-general-purport.html",
  import.meta.url,
);

test("parseSourcePage isolates the first current verse after removing next contents", async () => {
  const html = await readFile(verseFixtureUrl, "utf8");

  assert.deepEqual(parseSourcePage(html), {
    title: "Бхагавад-гита 2.47",
    sourceUrl: "https://vedabase.ru/bhagavad-gita/2/47/",
    originalHtml: "<p><strong>карманй эвадхикарас те</strong></p>",
    transliterationHtml: "<p>кармани эва адхикарах те</p>",
    synonymsHtml: "<p><em>кармани</em> — в предписанных обязанностях</p>",
    translationHtml: "<p>Ты имеешь право исполнять свой долг.</p>",
    purportHtml: "<p>Комментарий к текущему стиху.</p>",
  });
});

test("parseSourcePage collects prose blocks in DOM order", async () => {
  const html = await readFile(proseFixtureUrl, "utf8");

  assert.deepEqual(parseSourcePage(html), {
    title: "Предисловие",
    sourceUrl: "https://vedabase.ru/nectar-instructions/preface/",
    bodyHtml:
      "<p>Первый абзац.</p>\n<blockquote><p>Второй абзац.</p></blockquote>",
  });
});

test("parseSourcePage requires a canonical URL and page title", () => {
  assert.throws(
    () => parseSourcePage("<html><head><title>Page</title></head></html>"),
    /canonical/i,
  );
  assert.throws(
    () =>
      parseSourcePage(
        '<html><head><link rel="canonical" href="https://vedabase.ru/bhagavad-gita/2/47/"></head></html>',
      ),
    /title/i,
  );
});
