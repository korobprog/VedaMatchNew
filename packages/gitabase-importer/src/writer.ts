import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { GitabaseLibraryManifest } from "@vedamatch/shared";

import type { BuiltBookPackage } from "./package-builder.js";
import {
  assertSafeRelativePath,
  validateBookPackage,
  validateLibraryManifest,
} from "./validator.js";

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

function assertStagingPath(contentDir: string, stagingPath: string): void {
  const stagingRoot = resolve(contentDir, ".staging");
  const candidate = resolve(stagingPath);
  if (candidate !== stagingRoot && !candidate.startsWith(`${stagingRoot}${sep}`)) {
    throw new Error(`Unsafe staging path: ${candidate}`);
  }
}

export async function writeBookPackage(
  contentDir: string,
  built: BuiltBookPackage,
  runId: string,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error(`Invalid staging run ID: ${runId}`);
  }
  validateBookPackage(built);

  const finalDirectory = join(
    contentDir,
    "books",
    built.manifest.slug,
    built.manifest.contentVersion,
  );
  if (await pathExists(finalDirectory)) {
    throw new Error(
      `Immutable book version already exists: ${built.manifest.contentVersion}`,
    );
  }

  const runDirectory = join(contentDir, ".staging", runId);
  const stagingDirectory = join(
    runDirectory,
    "books",
    built.manifest.slug,
    built.manifest.contentVersion,
  );
  assertStagingPath(contentDir, runDirectory);
  if (await pathExists(runDirectory)) {
    throw new Error(`Staging run already exists: ${runId}`);
  }

  let published = false;
  try {
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(
      join(stagingDirectory, "manifest.json"),
      serializeJson(built.manifest),
      "utf8",
    );
    for (const [relativePath, content] of built.files) {
      assertSafeRelativePath(relativePath);
      const destination = join(stagingDirectory, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }

    await mkdir(dirname(finalDirectory), { recursive: true });
    await rename(stagingDirectory, finalDirectory);
    published = true;
    return finalDirectory;
  } finally {
    if (published || (await pathExists(runDirectory))) {
      assertStagingPath(contentDir, runDirectory);
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
}

export async function writeLibraryManifest(
  contentDir: string,
  manifest: GitabaseLibraryManifest,
): Promise<void> {
  validateLibraryManifest(manifest);
  await mkdir(contentDir, { recursive: true });
  const finalPath = join(contentDir, "library-manifest.json");
  const temporaryPath = join(contentDir, "library-manifest.json.tmp");
  await writeFile(temporaryPath, serializeJson(manifest), "utf8");
  await rename(temporaryPath, finalPath);
}

export async function readLibraryManifest(
  contentDir: string,
): Promise<GitabaseLibraryManifest> {
  return JSON.parse(
    await readFile(join(contentDir, "library-manifest.json"), "utf8"),
  ) as GitabaseLibraryManifest;
}
