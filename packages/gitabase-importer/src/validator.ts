import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  GitabaseBookManifest,
  GitabaseChapterDocument,
  GitabaseLibraryManifest,
  GitabasePackageFile,
} from "@vedamatch/shared";

import { compareOrdinal } from "./toc.js";

export interface ValidatableBookPackage {
  manifest: GitabaseBookManifest;
  files: ReadonlyMap<string, Buffer>;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSafeRelativePath(relativePath: string): void {
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe package path: ${relativePath}`);
  }
}

export function buildChecksumInput(
  files: readonly Pick<GitabasePackageFile, "path" | "sha256">[],
): string {
  return [...files]
    .sort((left, right) => compareOrdinal(left.path, right.path))
    .map((file) => `${file.path}\0${file.sha256}`)
    .join("\n");
}

export function computePackageChecksum(
  files: readonly Pick<GitabasePackageFile, "path" | "sha256">[],
): string {
  return sha256(buildChecksumInput(files));
}

export function validateBookPackage({
  manifest,
  files,
}: ValidatableBookPackage): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug)) {
    throw new Error(`Invalid book slug: ${manifest.slug}`);
  }
  if (
    !/^[a-f0-9]{64}$/.test(manifest.contentVersion) ||
    !/^[a-f0-9]{64}$/.test(manifest.packageChecksum)
  ) {
    throw new Error("Book package version or checksum is invalid");
  }
  if (!manifest.permissionRef.trim() || !manifest.attribution.trim()) {
    throw new Error("Book package rights metadata is required");
  }
  if (manifest.sourceOrigin !== "https://vedabase.ru") {
    throw new Error("Book package source origin is invalid");
  }
  if (manifest.chapters.length === 0) {
    throw new Error("Book package must contain at least one chapter");
  }

  const declaredPaths = new Set<string>();
  let totalBytes = 0;
  for (const file of manifest.files) {
    assertSafeRelativePath(file.path);
    if (declaredPaths.has(file.path)) {
      throw new Error(`Duplicate package file: ${file.path}`);
    }
    declaredPaths.add(file.path);
    const content = files.get(file.path);
    if (!content) {
      throw new Error(`Missing package file: ${file.path}`);
    }
    if (content.byteLength !== file.bytes || sha256(content) !== file.sha256) {
      throw new Error(`Package checksum or byte count mismatch: ${file.path}`);
    }
    totalBytes += file.bytes;
  }

  for (const path of files.keys()) {
    if (!declaredPaths.has(path)) {
      throw new Error(`Orphan package file: ${path}`);
    }
  }
  if (totalBytes !== manifest.sizeBytes) {
    throw new Error("Book package size does not match declared files");
  }
  if (computePackageChecksum(manifest.files) !== manifest.packageChecksum) {
    throw new Error("Book package checksum is invalid");
  }

  const chapterPaths = new Set<string>();
  const unitIds = new Set<string>();
  const sourceUrls = new Set<string>();
  for (const chapter of manifest.chapters) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.slug)) {
      throw new Error(`Invalid chapter slug: ${chapter.slug}`);
    }
    if (chapter.file !== `chapters/${chapter.slug}.json`) {
      throw new Error(`Invalid chapter path: ${chapter.file}`);
    }
    if (chapterPaths.has(chapter.file)) {
      throw new Error(`Duplicate chapter file: ${chapter.file}`);
    }
    chapterPaths.add(chapter.file);
    const content = files.get(chapter.file);
    if (!content) {
      throw new Error(`Orphan chapter manifest entry: ${chapter.file}`);
    }
    const document = JSON.parse(content.toString("utf8")) as GitabaseChapterDocument;
    if (
      document.bookSlug !== manifest.slug ||
      document.slug !== chapter.slug ||
      document.order !== chapter.order
    ) {
      throw new Error(`Chapter metadata mismatch: ${chapter.file}`);
    }
    for (const unit of document.units) {
      if (new URL(unit.sourceUrl).origin !== manifest.sourceOrigin) {
        throw new Error(`Reading unit source origin is invalid: ${unit.sourceUrl}`);
      }
      if (unitIds.has(unit.id) || sourceUrls.has(unit.sourceUrl)) {
        throw new Error(`Duplicate reading unit: ${unit.id}`);
      }
      unitIds.add(unit.id);
      sourceUrls.add(unit.sourceUrl);
    }
  }
}

export async function validatePublishedBookPackage(
  versionDirectory: string,
): Promise<GitabaseBookManifest> {
  const manifest = JSON.parse(
    await readFile(join(versionDirectory, "manifest.json"), "utf8"),
  ) as GitabaseBookManifest;
  const files = new Map<string, Buffer>();
  for (const file of manifest.files) {
    assertSafeRelativePath(file.path);
    files.set(file.path, await readFile(join(versionDirectory, file.path)));
  }
  validateBookPackage({ manifest, files });
  return manifest;
}

export function validateLibraryManifest(manifest: GitabaseLibraryManifest): void {
  if (manifest.formatVersion !== 1) {
    throw new Error("Unsupported library manifest format");
  }
  const slugs = new Set<string>();
  for (const book of manifest.books) {
    if (slugs.has(book.slug)) {
      throw new Error(`Duplicate library book: ${book.slug}`);
    }
    slugs.add(book.slug);
    if (!book.permissionRef.trim() || !book.attribution.trim()) {
      throw new Error(`Library book rights metadata is missing: ${book.slug}`);
    }
  }
}
