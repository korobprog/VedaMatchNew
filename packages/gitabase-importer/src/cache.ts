import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CachedSourceResponse {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: string;
  sha256: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sourceCacheKey(url: URL): string {
  return sha256(url.href);
}

function isCachedSourceResponse(value: unknown): value is CachedSourceResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CachedSourceResponse>;
  return (
    typeof candidate.requestedUrl === "string" &&
    typeof candidate.finalUrl === "string" &&
    typeof candidate.contentType === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.sha256 === "string" &&
    sha256(candidate.body) === candidate.sha256
  );
}

export class SourceCache {
  constructor(private readonly directory: string) {}

  async get(url: URL): Promise<CachedSourceResponse | null> {
    try {
      const raw = await readFile(this.pathFor(url), "utf8");
      const cached: unknown = JSON.parse(raw);
      if (!isCachedSourceResponse(cached) || cached.requestedUrl !== url.href) {
        return null;
      }
      return cached;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      if (error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  }

  async set(url: URL, response: CachedSourceResponse): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const cachePath = this.pathFor(url);
    const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(response), "utf8");
    await rename(temporaryPath, cachePath);
  }

  private pathFor(url: URL): string {
    return join(this.directory, `${sourceCacheKey(url)}.json`);
  }
}
