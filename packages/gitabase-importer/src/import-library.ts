import type {
  GitabaseBookManifest,
  GitabaseLibraryManifest,
} from "@vedamatch/shared";

import type { GitabaseBookSlug } from "./catalog.js";
import {
  importBook,
  type ImportBookOptions,
  type SourceFetcherLike,
} from "./import-book.js";
import { parseSitemap } from "./sitemap.js";
import { writeLibraryManifest } from "./writer.js";
import type { DatabaseBookWriter } from "./database-writer.js";

export interface LibraryImportPlanEntry {
  slug: GitabaseBookSlug;
  urlCount: number;
}

export interface PlanLibraryImportOptions {
  fetcher: SourceFetcherLike;
  sitemapUrl: URL;
  slugs: readonly GitabaseBookSlug[];
}

export async function fetchLibraryUrls(
  options: PlanLibraryImportOptions,
): Promise<Map<GitabaseBookSlug, URL[]>> {
  const response = await options.fetcher.get(options.sitemapUrl);
  const selected = new Set<string>(options.slugs);
  const urls = parseSitemap(response.body, selected);
  const urlsBySlug = new Map<GitabaseBookSlug, URL[]>();
  for (const slug of options.slugs) {
    urlsBySlug.set(slug, []);
  }
  for (const url of urls) {
    const slug = url.pathname.split("/")[1] as GitabaseBookSlug;
    urlsBySlug.get(slug)?.push(url);
  }
  return urlsBySlug;
}

export async function planLibraryImport(
  options: PlanLibraryImportOptions,
): Promise<LibraryImportPlanEntry[]> {
  const urlsBySlug = await fetchLibraryUrls(options);
  return options.slugs.map((slug) => ({
    slug,
    urlCount: urlsBySlug.get(slug)?.length ?? 0,
  }));
}

type ImportBookFunction = (
  options: ImportBookOptions,
) => Promise<GitabaseBookManifest>;

export interface ImportLibraryOptions extends PlanLibraryImportOptions {
  contentDir?: string;
  writer?: DatabaseBookWriter;
  resume?: boolean;
  permissionRef: string;
  attribution: string;
  generatedAt: string;
  urlsBySlug?: ReadonlyMap<GitabaseBookSlug, readonly URL[]>;
  importBookFn?: ImportBookFunction;
}

export async function importLibrary(
  options: ImportLibraryOptions,
): Promise<GitabaseLibraryManifest> {
  if (!options.permissionRef.trim() || !options.attribution.trim()) {
    throw new Error("Permission reference and attribution are required");
  }
  const urlsBySlug =
    options.urlsBySlug ?? (await fetchLibraryUrls(options));
  const importBookFn = options.importBookFn ?? importBook;
  const books: GitabaseBookManifest[] = [];

  for (let index = 0; index < options.slugs.length; index += 1) {
    const slug = options.slugs[index]!;
    const urls = urlsBySlug.get(slug) ?? [];
    if (urls.length === 0) {
      throw new Error(`No sitemap URLs found for ${slug}`);
    }
    books.push(
      await importBookFn({
        contentDir: options.contentDir,
        writer: options.writer,
        resume: options.resume,
        fetcher: options.fetcher,
        slug,
        urls,
        title: slug,
        author: null,
        importedAt: options.generatedAt,
        permissionRef: options.permissionRef,
        attribution: options.attribution,
        runId: `${index + 1}-${slug}-${Date.now()}`,
      }),
    );
  }

  const library: GitabaseLibraryManifest = {
    formatVersion: 1,
    generatedAt: options.generatedAt,
    books,
  };
  if (options.contentDir) await writeLibraryManifest(options.contentDir, library);
  return library;
}
