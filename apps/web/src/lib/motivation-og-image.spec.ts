import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_ATTEMPTS,
  OG_IMAGE_MAX_BYTES,
  encodeWithinLimit,
  ogImagePath,
  ogImageSource,
  type OgEncoding,
} from "./motivation-og-image";

describe("encodeWithinLimit", () => {
  it("первая попытка влезла — дальше не кодирует", async () => {
    const seen: OgEncoding[] = [];
    const result = await encodeWithinLimit(async (attempt) => {
      seen.push(attempt);
      return new Uint8Array(1000);
    });

    expect(seen).toHaveLength(1);
    expect(result.attempt).toBe(OG_IMAGE_ATTEMPTS[0]);
  });

  it("тяжёлый кадр снижает качество, пока не уложится в предел", async () => {
    const result = await encodeWithinLimit(async ({ quality }) =>
      new Uint8Array(quality > 70 ? OG_IMAGE_MAX_BYTES + 1 : 200_000),
    );

    expect(result.attempt.quality).toBeLessThanOrEqual(70);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(OG_IMAGE_MAX_BYTES);
  });

  it("не влезло ни разу — отдаёт последнюю, самую лёгкую попытку", async () => {
    const result = await encodeWithinLimit(
      async () => new Uint8Array(OG_IMAGE_MAX_BYTES * 2),
    );

    expect(result.attempt).toBe(OG_IMAGE_ATTEMPTS.at(-1));
  });

  it("лестница только облегчает кадр и держит пропорции 9:16", () => {
    for (let i = 1; i < OG_IMAGE_ATTEMPTS.length; i++) {
      const prev = OG_IMAGE_ATTEMPTS[i - 1];
      const next = OG_IMAGE_ATTEMPTS[i];
      expect(next.width * next.quality).toBeLessThan(prev.width * prev.quality);
    }
    for (const { width, height } of OG_IMAGE_ATTEMPTS)
      expect(height / width).toBeCloseTo(16 / 9, 1);
  });

  it("предел строже, чем у WhatsApp (~300 КБ)", () => {
    expect(OG_IMAGE_MAX_BYTES).toBeLessThanOrEqual(300_000);
  });
});

describe("ogImagePath", () => {
  it("живёт под открытым гостю префиксом /m/", () => {
    expect(ogImagePath("reel-33e14d6e-mu28cb8x")).toBe(
      "/m/reel-33e14d6e-mu28cb8x/og",
    );
  });

  it("экранирует slug", () => {
    expect(ogImagePath("a/b?c")).toBe("/m/a%2Fb%3Fc/og");
  });
});

describe("ogImageSource", () => {
  it("берёт сторис-кадр — на нём цитата", () => {
    expect(ogImageSource({ storyImageUrl: "s", imageUrl: "i" })).toBe("s");
  });

  it("без сторис — фон, без обоих — ничего", () => {
    expect(ogImageSource({ storyImageUrl: "", imageUrl: "i" })).toBe("i");
    expect(ogImageSource({})).toBeNull();
  });
});
