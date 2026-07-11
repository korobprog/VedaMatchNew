import assert from "node:assert/strict";
import test from "node:test";

import { GITABASE_BOOK_SLUGS } from "../src/catalog.js";
import { assertAllowedSourceUrl } from "../src/source-policy.js";

const EXPECTED_BOOK_SLUGS = [
  "bhagavad-gita",
  "srimad-bhagavatam",
  "chaitanya-charitamrita",
  "nectar-devotion",
  "nectar-instructions",
  "isopanishad",
  "prabhupada-lilamrita",
  "raja-vidya",
  "light-bhagavata",
  "perfection-yoga",
  "path-perfection",
  "beyond-birth-death",
  "journey-krishna",
  "another-chance",
  "prayers-kunti",
] as const;

test("catalog exposes the immutable 15-book Vedabase allowlist", () => {
  assert.deepEqual(GITABASE_BOOK_SLUGS, EXPECTED_BOOK_SLUGS);
  assert.equal(GITABASE_BOOK_SLUGS.length, 15);
  assert.equal(Object.isFrozen(GITABASE_BOOK_SLUGS), true);
});

test("source policy allows the sitemap and clean allowlisted book paths", () => {
  const urls = [
    "https://vedabase.ru/sitemap.xml",
    "https://vedabase.ru/bhagavad-gita/",
    "https://vedabase.ru/srimad-bhagavatam/1/2/",
    "https://vedabase.ru/nectar-instructions/preface/",
  ];

  for (const url of urls) {
    assert.equal(assertAllowedSourceUrl(new URL(url)), undefined);
  }
});

test("source policy rejects dynamic endpoints, query URLs, and other origins", () => {
  const urls = [
    "https://vedabase.ru/ajax.php",
    "https://vedabase.ru/next.php",
    "https://vedabase.ru/go.php",
    "https://vedabase.ru/go_to_search.php",
    "https://vedabase.ru/bhagavad-gita/?query=x",
    "https://example.com/bhagavad-gita/",
  ];

  for (const url of urls) {
    assert.throws(() => assertAllowedSourceUrl(new URL(url)));
  }
});

test("source policy denies every URL shape not explicitly allowed", () => {
  const urls = [
    "http://vedabase.ru/bhagavad-gita/",
    "https://www.vedabase.ru/bhagavad-gita/",
    "https://vedabase.ru:8443/bhagavad-gita/",
    "https://user:password@vedabase.ru/bhagavad-gita/",
    "https://vedabase.ru/bhagavad-gita/#verse-1",
    "https://vedabase.ru/bhagavad-gita/?",
    "https://vedabase.ru/bhagavad-gita/#",
    "https://vedabase.ru/bhagavad-gita",
    "https://vedabase.ru/",
    "https://vedabase.ru/search/",
    "https://vedabase.ru/bhagavad-gita/ajax.php/",
    "https://vedabase.ru/bhagavad-gita//1/",
    "https://vedabase.ru/bhagavad-gita/%2Fnext/",
  ];

  for (const url of urls) {
    assert.throws(() => assertAllowedSourceUrl(new URL(url)), url);
  }
});
