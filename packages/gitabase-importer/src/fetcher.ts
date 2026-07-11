import { createHash } from "node:crypto";

import {
  type CachedSourceResponse,
  SourceCache,
} from "./cache.js";
import { assertAllowedSourceUrl } from "./source-policy.js";

const USER_AGENT = "VedaMatchGitabaseImporter/1.0 (+info@vedabase.ru)";
const DEFAULT_MIN_DELAY_MS = 1500;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_REDIRECTS = 10;

class FatalFetchError extends Error {}

class RetryableFetchError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface SourceFetcherOptions {
  cacheDir?: string;
  resume?: boolean;
  minDelayMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
}

interface FinalResponse {
  response: Response;
  finalUrl: URL;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;
type SetTimeoutFn = (
  callback: () => void,
  milliseconds: number,
) => TimeoutHandle;
type ClearTimeoutFn = (timeout: TimeoutHandle) => void;

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - now);
}

function assertExpectedContentType(url: URL, contentType: string): void {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  const allowedMediaTypes =
    url.pathname === "/sitemap.xml"
      ? new Set(["application/xml", "text/xml"])
      : new Set(["text/html", "application/xhtml+xml"]);

  if (!mediaType || !allowedMediaTypes.has(mediaType)) {
    throw new FatalFetchError(
      `Unexpected source content type for ${url.href}: ${contentType || "missing"}`,
    );
  }
}

export class SourceFetcher {
  private readonly cache: SourceCache | null;
  private readonly resume: boolean;
  private readonly minDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly setTimeoutFn: SetTimeoutFn;
  private readonly clearTimeoutFn: ClearTimeoutFn;
  private queue: Promise<void> = Promise.resolve();
  private lastRequestStartedAt: number | null = null;

  constructor(options: SourceFetcherOptions = {}) {
    this.cache = options.cacheDir ? new SourceCache(options.cacheDir) : null;
    this.resume = options.resume ?? false;
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.now = options.now ?? Date.now;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

    if (this.minDelayMs < 0 || this.timeoutMs <= 0 || this.maxAttempts < 1) {
      throw new Error("Invalid SourceFetcher timing or attempt configuration");
    }
    if (this.resume && !this.cache) {
      throw new Error("SourceFetcher resume mode requires cacheDir");
    }
  }

  get(url: URL): Promise<CachedSourceResponse> {
    const requestedUrl = new URL(url.href);
    const result = this.queue.then(() => this.getSequential(requestedUrl));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async getSequential(url: URL): Promise<CachedSourceResponse> {
    assertAllowedSourceUrl(url);

    if (this.resume && this.cache) {
      const cached = await this.cache.get(url);
      if (cached) {
        assertAllowedSourceUrl(new URL(cached.finalUrl));
        return cached;
      }
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const { response, finalUrl } = await this.fetchFollowingRedirects(url);
        const contentType = response.headers.get("content-type") ?? "";
        assertExpectedContentType(finalUrl, contentType);
        const body = await response.text();
        const result: CachedSourceResponse = {
          requestedUrl: url.href,
          finalUrl: finalUrl.href,
          contentType,
          body,
          sha256: hashBody(body),
        };
        await this.cache?.set(url, result);
        return result;
      } catch (error) {
        if (error instanceof FatalFetchError) {
          throw error;
        }

        lastError = error;
        if (attempt === this.maxAttempts) {
          break;
        }
        const retryAfterMs =
          error instanceof RetryableFetchError ? error.retryAfterMs : undefined;
        await this.sleep(retryAfterMs ?? 1000 * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }

  private async fetchFollowingRedirects(url: URL): Promise<FinalResponse> {
    let currentUrl = url;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await this.fetchOnce(currentUrl);
      if (!isRedirect(response)) {
        if (response.status === 429) {
          throw new RetryableFetchError(
            `Source request failed with status 429 for ${currentUrl.href}`,
            parseRetryAfter(response.headers.get("retry-after"), this.now()),
          );
        }
        if (response.status >= 500) {
          throw new RetryableFetchError(
            `Source request failed with status ${response.status} for ${currentUrl.href}`,
          );
        }
        if (!response.ok) {
          throw new FatalFetchError(
            `Source request failed with status ${response.status} for ${currentUrl.href}`,
          );
        }
        return { response, finalUrl: currentUrl };
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new FatalFetchError(
          `Source redirect is missing Location for ${currentUrl.href}`,
        );
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new FatalFetchError(`Too many source redirects for ${url.href}`);
      }

      const redirectUrl = new URL(location, currentUrl);
      try {
        assertAllowedSourceUrl(redirectUrl);
      } catch (error) {
        throw new FatalFetchError(
          error instanceof Error ? error.message : "Source redirect is not allowed",
        );
      }
      currentUrl = redirectUrl;
    }

    throw new FatalFetchError(`Too many source redirects for ${url.href}`);
  }

  private async fetchOnce(url: URL): Promise<Response> {
    await this.waitForRateLimit();
    const controller = new AbortController();
    const timeout = this.setTimeoutFn(() => {
      controller.abort(
        new Error(`Source request timed out after ${this.timeoutMs}ms`),
      );
    }, this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      this.clearTimeoutFn(timeout);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.lastRequestStartedAt !== null) {
      const remaining =
        this.minDelayMs - (this.now() - this.lastRequestStartedAt);
      if (remaining > 0) {
        await this.sleep(remaining);
      }
    }
    this.lastRequestStartedAt = this.now();
  }
}
