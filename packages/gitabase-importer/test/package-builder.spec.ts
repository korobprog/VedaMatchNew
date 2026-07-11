import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { GitabaseReadingUnit } from "@vedamatch/shared";

import { stableUnitId } from "../src/locators.js";
import { buildBookPackage } from "../src/package-builder.js";
import {
  buildSearchIndex,
  serializeSearchIndex,
} from "../src/search-index.js";
import { buildToc } from "../src/toc.js";
import {
  buildChecksumInput,
  validateBookPackage,
} from "../src/validator.js";
import { writeBookPackage } from "../src/writer.js";

const RIGHTS = {
  permissionRef: "contract-2026-07-10",
  attribution: "Vedabase.ru, imported with permission",
};

function samplePackage() {
  return buildBookPackage({
    slug: "bhagavad-gita",
    title: "Бхагавад-гита",
    author: null,
    importedAt: "2026-07-10T00:00:00.000Z",
    sourceUrl: "https://vedabase.ru/bhagavad-gita/",
    ...RIGHTS,
    pages: [
      {
        title: "Бхагавад-гита 2.2",
        sourceUrl: "https://vedabase.ru/bhagavad-gita/2/2/",
        translationHtml: "<p>Второй стих.</p>",
      },
      {
        title: "Бхагавад-гита 2.10",
        sourceUrl: "https://vedabase.ru/bhagavad-gita/2/10/",
        translationHtml: "<p>Десятый стих.</p>",
      },
      {
        title: "Бхагавад-гита 2.1",
        sourceUrl: "https://vedabase.ru/bhagavad-gita/2/1/",
        translationHtml: "<p>Первый стих.</p>",
      },
    ],
  });
}

test("buildToc preserves parent links and sorts numeric siblings 1, 2, 10", () => {
  const root = "https://vedabase.ru/bhagavad-gita/";
  const toc = buildToc([
    { title: "10", sourceUrl: `${root}10/`, parentSourceUrl: root },
    { title: "Root", sourceUrl: root },
    { title: "2", sourceUrl: `${root}2/`, parentSourceUrl: root },
    { title: "1", sourceUrl: `${root}1/`, parentSourceUrl: root },
  ]);

  assert.equal(toc.length, 1);
  assert.deepEqual(
    toc[0]?.children.map((node) => node.title),
    ["1", "2", "10"],
  );
});

test("stableUnitId is stable across runs and distinct across canonical URLs", () => {
  const sourceUrl = "https://vedabase.ru/bhagavad-gita/2/47/";
  assert.equal(stableUnitId(sourceUrl), stableUnitId(sourceUrl));
  assert.notEqual(
    stableUnitId(sourceUrl),
    stableUnitId("https://vedabase.ru/bhagavad-gita/2/48/"),
  );
});

test("search postings are byte-identical regardless of unit input order", () => {
  const units: GitabaseReadingUnit[] = [
    {
      id: "unit-b",
      title: "Йога действия",
      sourceUrl: "https://vedabase.ru/bhagavad-gita/2/2/",
      translationHtml: "<p>Действуй без привязанности.</p>",
    },
    {
      id: "unit-a",
      title: "Вечная йога",
      sourceUrl: "https://vedabase.ru/bhagavad-gita/2/1/",
      translationHtml: "<p>Йога очищает сознание.</p>",
    },
  ];

  const first = serializeSearchIndex(
    buildSearchIndex([{ chapterSlug: "2", units }]),
  );
  const second = serializeSearchIndex(
    buildSearchIndex([{ chapterSlug: "2", units: [...units].reverse() }]),
  );

  assert.equal(first, second);
  assert.deepEqual(JSON.parse(first)[0], {
    token: "без",
    hits: [{ chapterSlug: "2", unitId: "unit-b", field: "translationHtml" }],
  });
});

test("checksum input sorts relativePath + NUL + sha256 with an ordinal comparator", () => {
  assert.equal(
    buildChecksumInput([
      { path: "chapters/10.json", sha256: "ccc" },
      { path: "search-index.json", sha256: "ddd" },
      { path: "chapters/2.json", sha256: "bbb" },
      { path: "chapters/1.json", sha256: "aaa" },
    ]),
    "chapters/1.json\0aaa\nchapters/10.json\0ccc\nchapters/2.json\0bbb\nsearch-index.json\0ddd",
  );
});

test("TOC and package validation reject duplicates and orphans", () => {
  assert.throws(
    () =>
      buildToc([
        { title: "One", sourceUrl: "https://vedabase.ru/bhagavad-gita/1/" },
        { title: "Again", sourceUrl: "https://vedabase.ru/bhagavad-gita/1/" },
      ]),
    /duplicate/i,
  );
  assert.throws(
    () =>
      buildToc([
        {
          title: "Orphan",
          sourceUrl: "https://vedabase.ru/bhagavad-gita/2/",
          parentSourceUrl: "https://vedabase.ru/bhagavad-gita/",
        },
      ]),
    /orphan/i,
  );

  const built = samplePackage();
  const withOrphan = new Map(built.files);
  withOrphan.set("chapters/orphan.json", Buffer.from("{}"));
  assert.throws(
    () => validateBookPackage({ manifest: built.manifest, files: withOrphan }),
    /orphan/i,
  );
});

test("writer validates, atomically publishes, and rejects immutable versions", async () => {
  const contentDir = await mkdtemp(join(tmpdir(), "gitabase-package-"));
  const built = samplePackage();

  const finalDirectory = await writeBookPackage(contentDir, built, "run-one");
  assert.equal(
    finalDirectory,
    join(
      contentDir,
      "books",
      built.manifest.slug,
      built.manifest.contentVersion,
    ),
  );
  assert.equal(
    JSON.parse(await readFile(join(finalDirectory, "manifest.json"), "utf8"))
      .packageChecksum,
    built.manifest.packageChecksum,
  );
  await assert.rejects(
    stat(join(contentDir, ".staging", "run-one")),
    /ENOENT/,
  );

  await assert.rejects(
    () => writeBookPackage(contentDir, built, "run-two"),
    /immutable/i,
  );
});
