import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_ATTEMPTS,
  OG_IMAGE_MAX_BYTES,
  OG_PREVIEW_MAX_HEIGHT,
  OG_PREVIEW_MAX_WIDTH,
  OG_PREVIEW_MIN_WIDTH,
  encodeWithinLimit,
  ogImagePath,
  ogImageSource,
  ogPreviewSize,
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
    const result = await encodeWithinLimit(
      async ({ quality }) =>
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

  it("лестница только облегчает кадр", () => {
    for (let i = 1; i < OG_IMAGE_ATTEMPTS.length; i++) {
      const prev = OG_IMAGE_ATTEMPTS[i - 1];
      const next = OG_IMAGE_ATTEMPTS[i];
      expect(next.scale * next.quality).toBeLessThan(
        prev.scale * prev.quality,
      );
    }
  });

  it("первая ступень отдаёт кадр целиком, без уменьшения", () => {
    expect(OG_IMAGE_ATTEMPTS[0].scale).toBe(1);
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

/**
 * VED-201, третий заход. Владелец сравнил мессенджеры: в Max превью — чистая
 * иллюстрация с подписью под ней, а в WhatsApp и Telegram в превью уезжал
 * сторис-кадр с впечатанной цитатой, и текст шёл дважды (в Telegram — ещё и
 * обрезанный на полуслове). Правило: в `og:image` не попадает картинка с
 * наложенным текстом.
 */
describe("ogImageSource", () => {
  it("берёт чистую иллюстрацию, а не сторис-кадр с впечатанной цитатой", () => {
    expect(ogImageSource({ storyImageUrl: "story", imageUrl: "clean" })).toBe(
      "clean",
    );
  });

  it("сторис-кадр не идёт в превью даже запасным вариантом", () => {
    expect(ogImageSource({ storyImageUrl: "story", imageUrl: "" })).toBeNull();
    expect(ogImageSource({ storyImageUrl: "story" })).toBeNull();
  });

  it("без картинки — ничего", () => {
    expect(ogImageSource({})).toBeNull();
  });

  it("открытка идёт как есть: её надпись — часть самой картинки", () => {
    // У `captionInImage` текст напечатан в файле, который принёс человек, и
    // `storyImageUrl` — байт в байт та же картинка. Убирать нечего.
    expect(ogImageSource({ storyImageUrl: "same", imageUrl: "same" })).toBe(
      "same",
    );
  });
});

/**
 * VED-201, второй заход: «открытки, пересланные в мессенджеры, отображаются
 * урезанными». Кадр собирался жёстко под 9:16 с `fit: 'cover'`, и у готовой
 * картинки, принесённой файлом, срезало бока вместе с надписью.
 */
describe("ogPreviewSize", () => {
  const ratio = (size: { width: number; height: number }) =>
    size.width / size.height;

  it("держит пропорции квадратной открытки — бока не срезаются", () => {
    expect(ratio(ogPreviewSize({ width: 1000, height: 1000 }))).toBeCloseTo(
      1,
      2,
    );
  });

  it("держит пропорции горизонтальной открытки", () => {
    expect(ratio(ogPreviewSize({ width: 1600, height: 1200 }))).toBeCloseTo(
      4 / 3,
      2,
    );
  });

  it("держит пропорции иллюстрации рилса 1024×1536", () => {
    // Ровно этот кадр Max показывает целиком, и его же теперь получают
    // остальные мессенджеры.
    expect(ratio(ogPreviewSize({ width: 1024, height: 1536 }))).toBeCloseTo(
      2 / 3,
      2,
    );
  });

  it("никогда не выходит за пределы кадра", () => {
    for (const source of [
      { width: 4000, height: 3000 },
      { width: 1024, height: 1536 },
      { width: 1080, height: 1920 },
      { width: 3000, height: 800 },
      { width: 200, height: 2000 },
    ]) {
      const size = ogPreviewSize(source);
      expect(size.width).toBeLessThanOrEqual(OG_PREVIEW_MAX_WIDTH);
      expect(size.height).toBeLessThanOrEqual(OG_PREVIEW_MAX_HEIGHT);
    }
  });

  it("мелкую картинку подтягивает до читаемой ширины", () => {
    // Telegram мелкое превью показывает значком сбоку вместо большой карточки.
    const size = ogPreviewSize({ width: 240, height: 240 });
    expect(size.width).toBeGreaterThanOrEqual(OG_PREVIEW_MIN_WIDTH);
    expect(ratio(size)).toBeCloseTo(1, 2);
  });

  it("подтягивая мелкую, не пробивает потолок высоты", () => {
    expect(ogPreviewSize({ width: 60, height: 900 }).height).toBeLessThanOrEqual(
      OG_PREVIEW_MAX_HEIGHT,
    );
  });

  it("ступень лестницы уменьшает кадр, не меняя пропорций", () => {
    const full = ogPreviewSize({ width: 1200, height: 900 });
    const small = ogPreviewSize({ width: 1200, height: 900 }, { scale: 0.62 });
    expect(small.width).toBeLessThan(full.width);
    expect(ratio(small)).toBeCloseTo(ratio(full), 2);
  });

  it("вырожденный размер не роняет расчёт", () => {
    const size = ogPreviewSize({ width: 0, height: 0 });
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
