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
  needsBrandFooter,
  ogPreviewLayout,
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

describe("ogImageSource", () => {
  it("берёт сторис-кадр — на нём цитата", () => {
    expect(ogImageSource({ storyImageUrl: "s", imageUrl: "i" })).toBe("s");
  });

  it("без сторис — фон, без обоих — ничего", () => {
    expect(ogImageSource({ storyImageUrl: "", imageUrl: "i" })).toBe("i");
    expect(ogImageSource({})).toBeNull();
  });
});

/**
 * VED-201, второй заход: «открытки, пересланные в мессенджеры, отображаются
 * урезанными». Кадр собирался жёстко под 9:16 с `fit: 'cover'`, и у готовой
 * картинки, принесённой файлом, срезало бока вместе с надписью.
 */
describe("ogPreviewLayout", () => {
  const ratio = (w: number, h: number) => w / h;

  it("держит пропорции квадратной открытки — бока не срезаются", () => {
    const layout = ogPreviewLayout({ width: 1000, height: 1000 });
    expect(ratio(layout.picture.width, layout.picture.height)).toBeCloseTo(1, 2);
  });

  it("держит пропорции горизонтальной открытки", () => {
    const layout = ogPreviewLayout({ width: 1600, height: 1200 });
    expect(ratio(layout.picture.width, layout.picture.height)).toBeCloseTo(
      4 / 3,
      2,
    );
  });

  it("держит пропорции вертикальной сторис 9:16", () => {
    const layout = ogPreviewLayout({ width: 1080, height: 1920 });
    expect(ratio(layout.picture.width, layout.picture.height)).toBeCloseTo(
      9 / 16,
      2,
    );
  });

  it("никогда не выходит за пределы кадра", () => {
    for (const source of [
      { width: 4000, height: 3000 },
      { width: 1080, height: 1920 },
      { width: 3000, height: 800 },
      { width: 200, height: 2000 },
    ]) {
      const layout = ogPreviewLayout(source);
      expect(layout.width).toBeLessThanOrEqual(OG_PREVIEW_MAX_WIDTH);
      expect(layout.picture.height).toBeLessThanOrEqual(OG_PREVIEW_MAX_HEIGHT);
    }
  });

  it("мелкую картинку подтягивает до читаемой ширины", () => {
    // Иначе полоса с подписью выходит нечитаемой, а Telegram мелкое превью
    // показывает значком сбоку вместо большой карточки.
    const layout = ogPreviewLayout({ width: 240, height: 240 });
    expect(layout.width).toBeGreaterThanOrEqual(OG_PREVIEW_MIN_WIDTH);
    expect(ratio(layout.picture.width, layout.picture.height)).toBeCloseTo(1, 2);
  });

  it("подтягивая мелкую, не пробивает потолок высоты", () => {
    const layout = ogPreviewLayout({ width: 60, height: 900 });
    expect(layout.picture.height).toBeLessThanOrEqual(OG_PREVIEW_MAX_HEIGHT);
  });

  it("полоса с подписью лежит под картинкой во всю ширину", () => {
    const layout = ogPreviewLayout({ width: 1000, height: 1000 });
    expect(layout.footer.left).toBe(0);
    expect(layout.footer.width).toBe(layout.width);
    expect(layout.footer.top).toBe(layout.picture.height);
    expect(layout.footer.height).toBeGreaterThan(0);
  });

  it("кадр — это картинка плюс полоса, без полей", () => {
    const layout = ogPreviewLayout({ width: 1600, height: 900 });
    expect(layout.picture.left).toBe(0);
    expect(layout.picture.top).toBe(0);
    expect(layout.picture.width).toBe(layout.width);
    expect(layout.height).toBe(layout.picture.height + layout.footer.height);
  });

  it("ступень лестницы уменьшает кадр, не меняя пропорций картинки", () => {
    const full = ogPreviewLayout({ width: 1200, height: 900 });
    const small = ogPreviewLayout({ width: 1200, height: 900 }, { scale: 0.62 });
    expect(small.width).toBeLessThan(full.width);
    expect(ratio(small.picture.width, small.picture.height)).toBeCloseTo(
      ratio(full.picture.width, full.picture.height),
      2,
    );
  });

  it("вырожденный размер не роняет раскладку", () => {
    const layout = ogPreviewLayout({ width: 0, height: 0 });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

/**
 * Полоса с подписью — только там, где нашего знака на картинке ещё нет.
 * У сторис-кадра рилса его рисует API (`composeStoryImage`), и вторая
 * полоса дала бы два логотипа подряд — ровно на путаницу со знаком в этом
 * кадре владелец жаловался по VED-227.
 */
describe("needsBrandFooter", () => {
  it("открытке полоса нужна: своего знака на ней нет", () => {
    expect(
      needsBrandFooter({ captionInImage: true, storyImageUrl: "s" }),
    ).toBe(true);
  });

  it("сторис-кадру рилса — не нужна, знак уже в кадре", () => {
    expect(
      needsBrandFooter({ captionInImage: false, storyImageUrl: "s" }),
    ).toBe(false);
  });

  it("без сторис-кадра идёт голый фон, и полоса нужна", () => {
    expect(needsBrandFooter({ captionInImage: false, storyImageUrl: "" })).toBe(
      true,
    );
    expect(needsBrandFooter({})).toBe(true);
  });
});

describe("ogPreviewLayout без полосы", () => {
  it("кадр равен самой картинке", () => {
    const layout = ogPreviewLayout(
      { width: 1080, height: 1920 },
      { footer: false },
    );
    expect(layout.footer.height).toBe(0);
    expect(layout.height).toBe(layout.picture.height);
  });
});
