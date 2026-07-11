import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

import type { GitabaseBookSlug } from "./catalog.js";
import { GITABASE_BOOK_SLUGS } from "./catalog.js";
import { SourceFetcher, type SourceFetcherOptions } from "./fetcher.js";
import type { SourceFetcherLike } from "./import-book.js";
import {
  importLibrary,
  planLibraryImport,
} from "./import-library.js";
import {
  validateLibraryManifest,
  validatePublishedBookPackage,
} from "./validator.js";
import { readLibraryManifest } from "./writer.js";
import { DatabaseBookWriter } from "./database-writer.js";

interface ParsedArguments {
  command: string;
  values: Map<string, string>;
  flags: Set<string>;
}

export interface CliDependencies {
  createFetcher?: (options: SourceFetcherOptions) => SourceFetcherLike;
  writeLine?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  prisma?: PrismaClient;
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const [command = "", ...rest] = arguments_;
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }
    values.set(key, next);
    index += 1;
  }
  return { command, values, flags };
}

function selectedSlugs(parsed: ParsedArguments): GitabaseBookSlug[] {
  const all = parsed.flags.has("all");
  const book = parsed.values.get("book");
  if (all === Boolean(book)) {
    throw new Error("Choose exactly one of --book or --all");
  }
  if (all) {
    return [...GITABASE_BOOK_SLUGS];
  }
  if (!GITABASE_BOOK_SLUGS.includes(book as GitabaseBookSlug)) {
    throw new Error(`Unknown Gitabase book: ${book}`);
  }
  return [book as GitabaseBookSlug];
}

function sourceUrls(parsed: ParsedArguments): {
  sourceUrl: URL;
  sitemapUrl: URL;
} {
  const sourceUrl = new URL(
    parsed.values.get("source") ?? "https://vedabase.ru",
  );
  if (sourceUrl.href !== "https://vedabase.ru/") {
    throw new Error("--source must be exactly https://vedabase.ru");
  }
  const sitemapUrl = new URL(
    parsed.values.get("sitemap") ?? "https://vedabase.ru/sitemap.xml",
  );
  if (sitemapUrl.href !== "https://vedabase.ru/sitemap.xml") {
    throw new Error("--sitemap must be exactly https://vedabase.ru/sitemap.xml");
  }
  return { sourceUrl, sitemapUrl };
}

export async function runCli(
  arguments_: readonly string[],
  dependencies: CliDependencies = {},
): Promise<void> {
  const parsed = parseArguments(arguments_);
  const writeLine = dependencies.writeLine ?? console.log;
  const env = dependencies.env ?? process.env;

  if (!["plan", "import", "validate", "activate", "status"].includes(parsed.command)) {
    throw new Error("Command must be plan, import, validate, activate, or status");
  }

  const slugs = selectedSlugs(parsed);
  const { sitemapUrl } = sourceUrls(parsed);
  const permissionRef = parsed.values.get("permission-ref") ?? "";
  const attribution = parsed.values.get("attribution") ?? "";
  if (
    parsed.command === "import" &&
    (!permissionRef.trim() || !attribution.trim())
  ) {
    throw new Error("Import requires --permission-ref and --attribution");
  }

  const cacheDir =
    parsed.values.get("cache-dir") ??
    env.VEDABASE_CACHE_DIR ?? env.GITABASE_CACHE_DIR ??
    join(process.cwd(), ".vedabase-cache");
  const createFetcher =
    dependencies.createFetcher ??
    ((options: SourceFetcherOptions) => new SourceFetcher(options));
  const fetcher = createFetcher({
    cacheDir,
    resume: parsed.flags.has("resume"),
  });

  if (parsed.command === "plan") {
    const plan = await planLibraryImport({ fetcher, sitemapUrl, slugs });
    for (const entry of plan) {
      writeLine(`${entry.slug}: ${entry.urlCount} URL(s)`);
    }
    writeLine(
      `Total: ${plan.reduce((total, entry) => total + entry.urlCount, 0)} URL(s)`,
    );
    return;
  }

  const ownedPrisma = dependencies.prisma ? null : new PrismaClient();
  const prisma = dependencies.prisma ?? ownedPrisma!;
  const writer = new DatabaseBookWriter(prisma);
  try {
    if (parsed.command === "status") {
      const rows = await prisma.vedabaseBookVersion.findMany({ include: { book: true }, orderBy: { updatedAt: "desc" } });
      for (const row of rows) writeLine(`${row.book.slug}: ${row.contentVersion} ${row.status}`);
      return;
    }
    if (parsed.command === "validate" || parsed.command === "activate") {
      const books = await prisma.vedabaseBook.findMany({ where: { slug: { in: slugs } }, include: { versions: { orderBy: { updatedAt: "desc" }, take: 1 } } });
      for (const book of books) {
        const version = book.versions[0];
        if (!version) throw new Error(`No Vedabase version found for ${book.slug}`);
        if (parsed.command === "validate") await writer.validate(version.id); else await writer.activate(version.id);
      }
      return;
    }
    const library = await importLibrary({
    writer,
    resume: parsed.flags.has("resume"),
    fetcher,
    sitemapUrl,
    slugs,
    generatedAt: new Date().toISOString(),
    permissionRef,
    attribution,
  });
  writeLine(`Imported ${library.books.length} book package(s)`);
  } finally {
    if (ownedPrisma) await ownedPrisma.$disconnect();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === invokedPath) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
