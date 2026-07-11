import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import type { SourceFetcherLike } from "../src/import-book.js";
import { importBook } from "../src/import-book.js";
import {
  importLibrary,
  planLibraryImport,
} from "../src/import-library.js";

const SITEMAP_URL = new URL("https://vedabase.ru/sitemap.xml");
const PAGE_ONE = new URL("https://vedabase.ru/bhagavad-gita/2/1/");
const PAGE_TWO = new URL("https://vedabase.ru/bhagavad-gita/2/2/");
const RIGHTS = {
  permissionRef: "contract-2026-07-10",
  attribution: "Vedabase.ru, imported with permission",
};

function sourceResult(url: URL, body: string, contentType: string) {
  return {
    requestedUrl: url.href,
    finalUrl: url.href,
    contentType,
    body,
    sha256: "fixture",
  };
}

function pageHtml(url: URL, title: string, translation: string): string {
  return `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="${url.href}"></head><body><main id="content"><h1>${title}</h1><section id="verse-block"><div class="verse-translation"><p>${translation}</p></div></section></main></body></html>`;
}

test("planLibraryImport fetches only the sitemap and reports selected URL counts", async () => {
  const calls: string[] = [];
  const fetcher: SourceFetcherLike = {
    get: async (url) => {
      calls.push(url.href);
      assert.equal(url.href, SITEMAP_URL.href, "plan must not fetch a book page");
      return sourceResult(
        url,
        `<?xml version="1.0"?><urlset><url><loc>${PAGE_TWO.href}</loc></url><url><loc>${PAGE_ONE.href}</loc></url></urlset>`,
        "application/xml",
      );
    },
  };

  const plan = await planLibraryImport({
    fetcher,
    sitemapUrl: SITEMAP_URL,
    slugs: ["bhagavad-gita"],
  });

  assert.deepEqual(calls, [SITEMAP_URL.href]);
  assert.deepEqual(plan, [{ slug: "bhagavad-gita", urlCount: 2 }]);
});

test("importBook fetches pages sequentially and publishes a validated package", async () => {
  const contentDir = await mkdtemp(join(tmpdir(), "gitabase-import-book-"));
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  const fetcher: SourceFetcherLike = {
    get: async (url) => {
      calls.push(url.href);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return sourceResult(
        url,
        pageHtml(url, url.pathname.endsWith("/1/") ? "Стих 1" : "Стих 2", "Перевод"),
        "text/html",
      );
    },
  };

  const manifest = await importBook({
    contentDir,
    fetcher,
    slug: "bhagavad-gita",
    urls: [PAGE_TWO, PAGE_ONE],
    title: "Бхагавад-гита",
    author: null,
    importedAt: "2026-07-10T00:00:00.000Z",
    runId: "book-test",
    ...RIGHTS,
  });

  assert.equal(maxActive, 1);
  assert.deepEqual(calls, [PAGE_ONE.href, PAGE_TWO.href]);
  const publishedManifest = JSON.parse(
    await readFile(
      join(
        contentDir,
        "books",
        manifest.slug,
        manifest.contentVersion,
        "manifest.json",
      ),
      "utf8",
    ),
  );
  assert.equal(publishedManifest.packageChecksum, manifest.packageChecksum);
});

test("importLibrary processes selected books sequentially and atomically writes the library manifest", async () => {
  const contentDir = await mkdtemp(join(tmpdir(), "gitabase-import-library-"));
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;

  const library = await importLibrary({
    contentDir,
    fetcher: { get: async () => { throw new Error("unused"); } },
    sitemapUrl: SITEMAP_URL,
    slugs: ["bhagavad-gita", "isopanishad"],
    generatedAt: "2026-07-10T00:00:00.000Z",
    ...RIGHTS,
    urlsBySlug: new Map([
      ["bhagavad-gita", [PAGE_ONE]],
      ["isopanishad", [new URL("https://vedabase.ru/isopanishad/1/")]],
    ]),
    importBookFn: async (options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(options.slug);
      await Promise.resolve();
      active -= 1;
      return {
        formatVersion: 1,
        slug: options.slug,
        title: options.slug,
        author: null,
        language: "ru",
        contentVersion: `version-${options.slug}`,
        packageChecksum: `checksum-${options.slug}`,
        sizeBytes: 1,
        coverPath: null,
        sourceUrl: `https://vedabase.ru/${options.slug}/`,
        sourceOrigin: "https://vedabase.ru",
        importedAt: options.importedAt,
        permissionRef: options.permissionRef,
        attribution: options.attribution,
        chapters: [],
        files: [],
      };
    },
  });

  assert.equal(maxActive, 1);
  assert.deepEqual(order, ["bhagavad-gita", "isopanishad"]);
  assert.deepEqual(
    JSON.parse(await readFile(join(contentDir, "library-manifest.json"), "utf8")),
    library,
  );
  await assert.rejects(
    stat(join(contentDir, "library-manifest.json.tmp")),
    /ENOENT/,
  );
});

test("CLI refuses import before network access when rights metadata is missing", async () => {
  let createdFetcher = false;
  await assert.rejects(
    () =>
      runCli(
        [
          "import",
          "--book",
          "bhagavad-gita",
          "--source",
          "https://vedabase.ru",
          "--sitemap",
          SITEMAP_URL.href,
        ],
        {
          createFetcher: () => {
            createdFetcher = true;
            throw new Error("must not create fetcher");
          },
          writeLine: () => undefined,
        },
      ),
    /permission-ref.*attribution/i,
  );
  assert.equal(createdFetcher, false);
});
