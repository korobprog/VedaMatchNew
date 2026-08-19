import { describe, expect, it } from "vitest";
import type { MotivationPostDto } from "@vedamatch/shared";
import {
  attributionLine,
  formatCount,
  mediaKindOf,
  seenDividerIndex,
  shareUrlFor,
  shouldLoadMore,
  viewDelayMs,
} from "./reels";

const post = (overrides: Partial<MotivationPostDto>): MotivationPostDto =>
  ({
    id: "p",
    slug: "p",
    videoUrl: "",
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
    ...overrides,
  }) as MotivationPostDto;

describe("seenDividerIndex", () => {
  it("points at the first repeated post", () => {
    expect(
      seenDividerIndex([
        post({ feedTier: "fresh" }),
        post({ feedTier: "unseen" }),
        post({ feedTier: "seen" }),
        post({ feedTier: "seen" }),
      ]),
    ).toBe(2);
  });

  it("is -1 when nothing is repeated or tiers are absent", () => {
    expect(seenDividerIndex([post({ feedTier: "unseen" })])).toBe(-1);
    expect(seenDividerIndex([post({})])).toBe(-1);
  });
});

describe("mediaKindOf", () => {
  it("treats a post with a video url as video", () => {
    expect(mediaKindOf(post({ videoUrl: "https://cdn/x.mp4" }))).toBe("video");
    expect(mediaKindOf(post({ videoUrl: "" }))).toBe("image");
  });
});

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1 тыс."],
    [1240, "1,2 тыс."],
    [12400, "12 тыс."],
  ])("formats %i as %s", (input, expected) => {
    expect(formatCount(input)).toBe(expected);
  });
});

describe("viewDelayMs", () => {
  it("gives video more time than a still", () => {
    expect(viewDelayMs("video")).toBeGreaterThan(viewDelayMs("image"));
  });
});

describe("shouldLoadMore", () => {
  it("fires three slides before the end only when more exists", () => {
    expect(shouldLoadMore(6, 10, true)).toBe(false);
    expect(shouldLoadMore(7, 10, true)).toBe(true);
    expect(shouldLoadMore(9, 10, false)).toBe(false);
    expect(shouldLoadMore(0, 0, true)).toBe(false);
  });
});

describe("shareUrlFor", () => {
  it("builds the public post link", () => {
    expect(shareUrlFor("bg-2-47", "https://vedamatch.app")).toBe("https://vedamatch.app/m/bg-2-47");
  });
});

describe("attributionLine", () => {
  it("joins the present parts and skips blanks", () => {
    expect(
      attributionLine(
        post({ attributionSpeaker: "Кришна", attributionWork: " ", attributionLocator: "БГ 2.47" }),
      ),
    ).toBe("Кришна · БГ 2.47");
    expect(attributionLine(post({}))).toBe("");
  });
});
