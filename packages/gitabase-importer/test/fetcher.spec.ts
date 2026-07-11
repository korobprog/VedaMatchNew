import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SourceFetcher } from "../src/fetcher.js";

const PAGE_URL = new URL("https://vedabase.ru/bhagavad-gita/2/47/");
const OTHER_PAGE_URL = new URL("https://vedabase.ru/bhagavad-gita/2/48/");

function htmlResponse(
  body = "<html><body>ok</body></html>",
  init: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

test("SourceFetcher serializes requests and enforces the default minimum delay", async () => {
  let now = 0;
  let active = 0;
  let maxActive = 0;
  const starts: number[] = [];
  const headers: string[] = [];
  const redirects: RequestRedirect[] = [];

  const fetchImpl: typeof fetch = async (_input, init) => {
    starts.push(now);
    headers.push(new Headers(init?.headers).get("user-agent") ?? "");
    redirects.push(init?.redirect ?? "follow");
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return htmlResponse();
  };

  const fetcher = new SourceFetcher({
    fetchImpl,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  });

  await Promise.all([fetcher.get(PAGE_URL), fetcher.get(OTHER_PAGE_URL)]);

  assert.equal(maxActive, 1);
  assert.deepEqual(starts, [0, 1500]);
  assert.deepEqual(headers, [
    "VedaMatchGitabaseImporter/1.0 (+info@vedabase.ru)",
    "VedaMatchGitabaseImporter/1.0 (+info@vedabase.ru)",
  ]);
  assert.deepEqual(redirects, ["manual", "manual"]);
});

test("SourceFetcher uses Retry-After for 429 responses", async () => {
  let attempt = 0;
  const delays: number[] = [];
  const fetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      attempt += 1;
      return attempt === 1
        ? new Response("busy", {
            status: 429,
            headers: { "retry-after": "3" },
          })
        : htmlResponse();
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  await fetcher.get(PAGE_URL);

  assert.equal(attempt, 2);
  assert.deepEqual(delays, [3000]);
});

test("SourceFetcher retries network and 5xx failures exponentially", async () => {
  let attempt = 0;
  const delays: number[] = [];
  const fetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new TypeError("socket closed");
      }
      return attempt === 2
        ? new Response("unavailable", { status: 503 })
        : htmlResponse();
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  await fetcher.get(PAGE_URL);

  assert.equal(attempt, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("SourceFetcher stops after a maximum of three attempts", async () => {
  let attempt = 0;
  const fetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      attempt += 1;
      return new Response("unavailable", { status: 503 });
    },
    sleep: async () => undefined,
  });

  await assert.rejects(() => fetcher.get(PAGE_URL), /503/);
  assert.equal(attempt, 3);
});

test("SourceFetcher applies a 60-second timeout by default", async () => {
  let scheduledTimeout = 0;
  const fetcher = new SourceFetcher({
    minDelayMs: 0,
    maxAttempts: 1,
    setTimeoutFn: (callback, milliseconds) => {
      scheduledTimeout = milliseconds;
      queueMicrotask(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => undefined,
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      }),
  });

  await assert.rejects(() => fetcher.get(PAGE_URL), /timed out/i);
  assert.equal(scheduledTimeout, 60_000);
});

test("SourceFetcher treats fatal 4xx and content-type errors as non-retryable", async () => {
  let notFoundCalls = 0;
  const notFoundFetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      notFoundCalls += 1;
      return new Response("missing", { status: 404 });
    },
    sleep: async () => undefined,
  });

  await assert.rejects(() => notFoundFetcher.get(PAGE_URL), /404/);
  assert.equal(notFoundCalls, 1);

  let contentTypeCalls = 0;
  const contentTypeFetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      contentTypeCalls += 1;
      return new Response("not html", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    sleep: async () => undefined,
  });

  await assert.rejects(() => contentTypeFetcher.get(PAGE_URL), /content type/i);
  assert.equal(contentTypeCalls, 1);
});

test("SourceFetcher manually validates every redirect", async () => {
  let calls = 0;
  const fetcher = new SourceFetcher({
    minDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/stolen/" },
      });
    },
  });

  await assert.rejects(() => fetcher.get(PAGE_URL), /not allowed/i);
  assert.equal(calls, 1);
});

test("SourceFetcher persists metadata and reuses cache in resume mode", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "gitabase-fetcher-"));
  const body = "<html><body>cached</body></html>";
  const initialFetcher = new SourceFetcher({
    cacheDir,
    minDelayMs: 0,
    fetchImpl: async () => htmlResponse(body),
  });

  const first = await initialFetcher.get(PAGE_URL);
  const expectedBodyHash = createHash("sha256").update(body).digest("hex");
  assert.equal(first.sha256, expectedBodyHash);

  const files = await readdir(cacheDir);
  const expectedCacheKey = createHash("sha256")
    .update(PAGE_URL.href)
    .digest("hex");
  assert.deepEqual(files, [`${expectedCacheKey}.json`]);
  const cached = JSON.parse(
    await readFile(join(cacheDir, files[0]), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(cached.body, body);
  assert.equal(cached.sha256, expectedBodyHash);

  const resumedFetcher = new SourceFetcher({
    cacheDir,
    resume: true,
    minDelayMs: 0,
    fetchImpl: async () => {
      throw new Error("network must not be called");
    },
  });

  assert.deepEqual(await resumedFetcher.get(PAGE_URL), first);
});
