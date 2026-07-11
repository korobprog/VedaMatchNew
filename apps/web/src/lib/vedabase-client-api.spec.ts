import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchVedabaseBookManifest,
  fetchVedabaseChapter,
  fetchVedabaseCover,
  fetchVedabaseSearchIndex,
} from "./vedabase-client-api";

afterEach(() => vi.unstubAllGlobals());

describe("Vedabase browser API client", () => {
  it("uses the explicit manifest endpoint with credentials", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ slug: "book" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchVedabaseBookManifest("book one", signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/vedabase/books/book%20one",
      { credentials: "include", signal },
    );
  });

  it("uses explicit chapter, search-index, and cover endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchMock);

    await fetchVedabaseChapter("book one", "chapter one");
    await fetchVedabaseSearchIndex("book one");
    await fetchVedabaseCover("book one");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:4000/vedabase/books/book%20one/chapters/chapter%20one",
      "http://localhost:4000/vedabase/books/book%20one/search-index",
      "http://localhost:4000/vedabase/books/book%20one/cover",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual({ credentials: "include", signal: undefined });
    }
  });
});
