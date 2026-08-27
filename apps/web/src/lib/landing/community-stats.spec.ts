import { describe, expect, it } from "vitest";
import type { ChatMapCommunity } from "@vedamatch/shared";
import { summarizeCommunities } from "./community-stats";

function point(over: Partial<ChatMapCommunity> = {}): ChatMapCommunity {
  return {
    community: { id: "c1", slug: "moscow", name: "Община Москвы" },
    lat: 55.75,
    lon: 37.61,
    city: "Москва",
    channels: 1,
    groups: 0,
    ...over,
  };
}

describe("summarizeCommunities", () => {
  it("на пустой карте показывает нули, а не пустоту", () => {
    expect(summarizeCommunities([])).toEqual({
      communities: 0,
      cities: 0,
      talks: 0,
    });
  });

  it("считает общины по числу меток", () => {
    const summary = summarizeCommunities([
      point(),
      point({ community: { id: "c2", slug: "spb", name: "СПб" }, city: "Санкт-Петербург" }),
    ]);
    expect(summary.communities).toBe(2);
  });

  it("складывает каналы и группы в общее число открытых бесед", () => {
    const summary = summarizeCommunities([
      point({ channels: 2, groups: 3 }),
      point({ channels: 1, groups: 1 }),
    ]);
    expect(summary.talks).toBe(7);
  });

  it("считает город один раз, даже когда общин в нём несколько", () => {
    const summary = summarizeCommunities([point(), point()]);
    expect(summary.cities).toBe(1);
  });

  it("не завышает охват из-за регистра и пробелов в названии города", () => {
    // Тот же приём, что у cityKey в схеме: иначе «Москва» и «москва » дали бы
    // два города там, где он один.
    const summary = summarizeCommunities([
      point({ city: "Москва" }),
      point({ city: " москва " }),
      point({ city: "МОСКВА" }),
    ]);
    expect(summary.cities).toBe(1);
  });

  it("не считает городом общину без города", () => {
    const summary = summarizeCommunities([
      point({ city: null }),
      point({ city: "  " }),
      point({ city: "Вриндаван" }),
    ]);
    expect(summary.cities).toBe(1);
    expect(summary.communities).toBe(3);
  });
});
