import type { GitabaseBookManifest } from "@vedamatch/shared";

import type { CachedSourceResponse } from "./cache.js";
import type { GitabaseBookSlug } from "./catalog.js";
import { buildBookPackage } from "./package-builder.js";
import { parseSourcePage } from "./parse-page.js";
import { sortBySourceUrl } from "./toc.js";
import { writeBookPackage } from "./writer.js";
import { DatabaseBookWriter } from "./database-writer.js";

export interface SourceFetcherLike {
  get(url: URL): Promise<CachedSourceResponse>;
}

export interface ImportBookOptions {
  contentDir?: string;
  writer?: DatabaseBookWriter;
  resume?: boolean;
  fetcher: SourceFetcherLike;
  slug: GitabaseBookSlug;
  urls: readonly URL[];
  title: string;
  author: string | null;
  importedAt: string;
  permissionRef: string;
  attribution: string;
  runId?: string;
}

export async function importBook(
  options: ImportBookOptions,
): Promise<GitabaseBookManifest> {
  const pages = [];
  const sortedUrls = sortBySourceUrl(
    options.urls.map((url) => ({ sourceUrl: url.href, url })),
  );
  for (const { url } of sortedUrls) {
    const response = await options.fetcher.get(url);
    pages.push(parseSourcePage(response.body));
  }

  const built = buildBookPackage({
    slug: options.slug,
    title: options.title,
    author: options.author,
    sourceUrl: `https://vedabase.ru/${options.slug}/`,
    importedAt: options.importedAt,
    permissionRef: options.permissionRef,
    attribution: options.attribution,
    pages,
  });
  if (options.writer) {
    const version = await options.writer.stage(built.manifest, options.resume);
    try {
      await options.writer.writeChapterBatch(version.id, built.chapters.map((chapter) => {
        const file = built.manifest.files.find((entry) => entry.path === `chapters/${chapter.slug}.json`)!;
        return { chapter, bytes: file.bytes, sha256: file.sha256 };
      }));
      await options.writer.writeSearchBatch(version.id, built.searchDocuments);
      await options.writer.validate(version.id);
    } catch (error) {
      await options.writer.fail(version.id, error);
      throw error;
    }
  } else if (options.contentDir && options.runId) {
    await writeBookPackage(options.contentDir, built, options.runId);
  } else {
    throw new Error("Database writer is required");
  }
  return built.manifest;
}
