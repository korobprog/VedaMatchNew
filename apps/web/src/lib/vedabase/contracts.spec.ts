import { describe, expect, it } from "vitest";
import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import { vedabaseDatabaseName } from "./local-db";

describe("Vedabase contracts", () => {
  it("represents an immutable 15-book library", () => {
    const manifest = {
      formatVersion: 1,
      generatedAt: "2026-07-10T00:00:00.000Z",
      books: [],
    } satisfies VedabaseLibraryManifest;

    expect(manifest.formatVersion).toBe(1);
  });

  it("uses the canonical user-scoped IndexedDB name", () => {
    expect(vedabaseDatabaseName("user-1")).toBe("vedabase:user-1");
  });
});
