import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_ATTEMPTS,
  OG_IMAGE_MAX_BYTES,
  OG_PREVIEW_MAX_HEIGHT,
  OG_PREVIEW_WIDTH,
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
        new Uint8Array(quality > 70 ? OG_IMAGE_MAX_BYTES + 1 : 50_000),
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
      expect(OG_IMAGE_ATTEMPTS[i].quality).toBeLessThan(
        OG_IMAGE_ATTEMPTS[i - 1].quality,
      );
    }
  });

  /**
   * VED-357. Ступени трогают только сжатие. Раньше последние уменьшали сам
   * кадр — с объявленными `og:image:width`/`height` это стало ложью: бот
   * разложил бы карточку по размеру, которого в файле нет.
   */
  it("ни одна ступень не меняет размер кадра", () => {
    for (const attempt of OG_IMAGE_ATTEMPTS) {
      expect(Object.keys(attempt)).toEqual(["quality"]);
    }
  });

  /**
   * VED-357, седьмой круг. Крупно WhatsApp показывал лёгкий кадр PR #360, а
   * миниатюры случались на 230–265 КБ. Предел — заметно меньше 100 КБ.
   */
  it("предел заметно меньше 100 КБ", () => {
    expect(OG_IMAGE_MAX_BYTES).toBeLessThanOrEqual(90_000);
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
 * VED-201, второй заход: «открытки отображаются урезанными» — кадр
 * собирался жёстко под 9:16 с `fit: 'cover'`.
 * VED-357, PR #463: альбомный 1200×630 с иллюстрацией посередине на размытой
 * копии — две трети карточки заняли поля, владелец назвал это уродством.
 * Теперь кадр — сама картинка в своих пропорциях: ни полей, ни обрезки.
 */
describe("ogPreviewSize", () => {
  const ratio = (size: { width: number; height: number }) =>
    size.width / size.height;

  const SOURCES = [
    { width: 1024, height: 1536 }, // иллюстрация рилса
    { width: 1080, height: 1920 }, // сторис
    { width: 1000, height: 1000 }, // квадратная открытка
    { width: 1600, height: 1200 }, // горизонтальная открытка
    { width: 3000, height: 800 }, // панорама
    { width: 200, height: 2000 }, // узкая полоса
    { width: 240, height: 240 }, // мелкая картинка
    { width: 4000, height: 3000 },
  ];

  it("иллюстрация рилса — вертикальные 630×945, как ширина варианта PR #360", () => {
    expect(ogPreviewSize({ width: 1024, height: 1536 })).toEqual({
      width: 630,
      height: 945,
    });
  });

  it("пропорции кадра — пропорции исходника: полей нет, обрезать нечего", () => {
    for (const source of SOURCES) {
      const size = ogPreviewSize(source);
      // Округление до целой точки — не больше пикселя по любой стороне.
      expect(Math.abs(size.height - (size.width * source.height) / source.width))
        .toBeLessThanOrEqual(1);
    }
  });

  it("ширина — OG_PREVIEW_WIDTH, если высота не упирается в потолок", () => {
    for (const source of SOURCES) {
      const size = ogPreviewSize(source);
      if (size.height < OG_PREVIEW_MAX_HEIGHT) {
        expect(size.width).toBe(OG_PREVIEW_WIDTH);
      }
    }
  });

  it("очень узкая упирается в высоту и становится уже, а не обрезается", () => {
    const size = ogPreviewSize({ width: 200, height: 2000 });
    expect(size.height).toBe(OG_PREVIEW_MAX_HEIGHT);
    expect(size.width).toBe(112);
    expect(ratio(size)).toBeCloseTo(0.1, 2);
  });

  it("сторис 9:16 ровно в потолок — тот же кадр 630×1120, что в PR #360", () => {
    expect(ogPreviewSize({ width: 1080, height: 1920 })).toEqual({
      width: 630,
      height: 1120,
    });
  });

  it("широкая открытка остаётся широкой", () => {
    expect(ogPreviewSize({ width: 1600, height: 1200 })).toEqual({
      width: 630,
      height: 473,
    });
    expect(ogPreviewSize({ width: 3000, height: 800 })).toEqual({
      width: 630,
      height: 168,
    });
  });

  it("мелкую картинку растягивает до ширины кадра, а не оставляет значком", () => {
    expect(ogPreviewSize({ width: 240, height: 240 })).toEqual({
      width: 630,
      height: 630,
    });
  });

  it("ни одна сторона не выходит за пределы", () => {
    for (const source of SOURCES) {
      const size = ogPreviewSize(source);
      expect(size.width).toBeLessThanOrEqual(OG_PREVIEW_WIDTH);
      expect(size.height).toBeLessThanOrEqual(OG_PREVIEW_MAX_HEIGHT);
    }
  });

  it("вырожденный размер не роняет расчёт", () => {
    const size = ogPreviewSize({ width: 0, height: 0 });
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
