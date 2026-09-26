import { describe, expect, it } from "vitest";
import { AUTO_COPY_TTL_MS, pickOfflineEvictions } from "./offline-evict";

const NOW = new Date("2026-10-01T00:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("pickOfflineEvictions", () => {
  it("убирает автоматическую копию, которую не слушали месяц", () => {
    const got = pickOfflineEvictions(
      [
        {
          trackId: "old",
          sizeBytes: 10,
          savedAt: daysAgo(40),
          origin: "upload",
        },
        {
          trackId: "fresh",
          sizeBytes: 10,
          savedAt: daysAgo(2),
          origin: "upload",
        },
      ],
      0,
      NOW,
    );
    expect(got).toEqual(["old"]);
  });

  it("прослушивание продлевает жизнь копии", () => {
    const got = pickOfflineEvictions(
      [
        {
          trackId: "played",
          sizeBytes: 10,
          savedAt: daysAgo(90),
          lastPlayedAt: daysAgo(3),
          origin: "upload",
        },
      ],
      0,
      NOW,
    );
    expect(got).toEqual([]);
  });

  it("под новую копию освобождает место с самых давно не слушанных", () => {
    const got = pickOfflineEvictions(
      [
        { trackId: "b", sizeBytes: 50, savedAt: daysAgo(5), origin: "upload" },
        { trackId: "a", sizeBytes: 50, savedAt: daysAgo(10), origin: "upload" },
        { trackId: "c", sizeBytes: 50, savedAt: daysAgo(1), origin: "upload" },
      ],
      80,
      NOW,
    );
    expect(got).toEqual(["a", "b"]);
  });

  it("скачанное вручную и старые записи без пометки не трогает никогда", () => {
    const got = pickOfflineEvictions(
      [
        {
          trackId: "manual",
          sizeBytes: 50,
          savedAt: daysAgo(400),
          origin: "download",
        },
        { trackId: "legacy", sizeBytes: 50, savedAt: daysAgo(400) },
      ],
      1_000,
      NOW,
    );
    expect(got).toEqual([]);
  });

  it("срок — ровно месяц", () => {
    expect(AUTO_COPY_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
