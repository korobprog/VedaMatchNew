import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as cheerio from "cheerio";

import { sanitizeSourceHtml } from "../src/sanitize.js";

const unsafeFixtureUrl = new URL("./fixtures/unsafe-page.html", import.meta.url);
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "em",
  "strong",
  "a",
  "sup",
  "sub",
  "ul",
  "ol",
  "li",
  "blockquote",
]);

test("sanitizeSourceHtml preserves only the strict source allowlist", async () => {
  const html = await readFile(unsafeFixtureUrl, "utf8");
  const sanitized = sanitizeSourceHtml(html);
  const $ = cheerio.load(sanitized, null, false);

  $("*").each((_index, element) => {
    const selected = $(element);
    const tagName = selected.prop("tagName")?.toLowerCase() ?? "";
    assert.equal(ALLOWED_TAGS.has(tagName), true, tagName);
    const attributes = Object.keys(selected.attr() ?? {});
    assert.deepEqual(
      attributes,
      tagName === "a" ? attributes.filter((name) => name === "href") : [],
    );
  });

  assert.equal(sanitized.includes("alert('script')"), false);
  assert.equal(sanitized.includes("display: none"), false);
  assert.equal(sanitized.includes("tracker.png"), false);
  assert.equal($("a").eq(0).attr("href"), undefined);
  assert.equal($("a").eq(1).attr("href"), undefined);
  assert.equal(
    $("a").eq(2).attr("href"),
    "https://vedabase.ru/bhagavad-gita/",
  );
  assert.equal($("strong").text(), "world");
  assert.equal($("li em").text(), "kept");
});
