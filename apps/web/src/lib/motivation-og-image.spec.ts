import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_ATTEMPTS,
  OG_IMAGE_MAX_BYTES,
  OG_PREVIEW_HEIGHT,
  OG_PREVIEW_WIDTH,
  encodeWithinLimit,
  ogBackdropSampleSize,
  ogImagePath,
  ogImageSource,
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
 * урезанными» — кадр собирался жёстко под 9:16 с `fit: 'cover'`.
 * VED-357, четвёртый: кадр стал повторять пропорции исходника, и вертикальную
 * карточку WhatsApp свернул в миниатюру сбоку. Теперь кадр всегда альбомный
 * 1200×630, а картинка в него вписана целиком — ни одного срезанного пикселя.
 */
describe("ogPreviewLayout", () => {
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

  it("кадр у всех постов один — иначе объявленный размер соврёт", () => {
    for (const source of SOURCES) {
      expect(ogPreviewLayout(source).frame).toEqual({
        width: OG_PREVIEW_WIDTH,
        height: OG_PREVIEW_HEIGHT,
      });
    }
  });

  it("кадр альбомный: WhatsApp большую карточку рисует такому", () => {
    expect(OG_PREVIEW_WIDTH / OG_PREVIEW_HEIGHT).toBeGreaterThan(1.5);
  });

  it("картинка вписана целиком, пропорции исходника сохранены", () => {
    for (const source of SOURCES) {
      const { art } = ogPreviewLayout(source);
      expect(ratio(art)).toBeCloseTo(ratio(source), 1);
    }
  });

  it("ничего не вылезает за кадр — срезать нечего", () => {
    for (const source of SOURCES) {
      const { art, left, top } = ogPreviewLayout(source);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + art.width).toBeLessThanOrEqual(OG_PREVIEW_WIDTH);
      expect(top + art.height).toBeLessThanOrEqual(OG_PREVIEW_HEIGHT);
    }
  });

  it("картинка стоит посередине — поля по бокам поровну", () => {
    for (const source of SOURCES) {
      const { art, left, top } = ogPreviewLayout(source);
      expect(Math.abs(OG_PREVIEW_WIDTH - art.width - left * 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(OG_PREVIEW_HEIGHT - art.height - top * 2)).toBeLessThanOrEqual(1);
    }
  });

  it("вертикальная упирается в высоту кадра, а не в ширину", () => {
    // Рилс 2:3: выше кадра, поэтому его высота и задаёт масштаб.
    expect(ogPreviewLayout({ width: 1024, height: 1536 }).art.height).toBe(
      OG_PREVIEW_HEIGHT,
    );
  });

  it("широкая упирается в ширину кадра", () => {
    expect(ogPreviewLayout({ width: 3000, height: 800 }).art.width).toBe(
      OG_PREVIEW_WIDTH,
    );
  });

  it("мелкую картинку растягивает до кадра, а не оставляет значком", () => {
    // Telegram мелкое превью показывает значком сбоку вместо большой карточки.
    const { art } = ogPreviewLayout({ width: 240, height: 240 });
    expect(art.height).toBe(OG_PREVIEW_HEIGHT);
    expect(ratio(art)).toBeCloseTo(1, 2);
  });

  it("вырожденный размер не роняет расчёт", () => {
    const { art } = ogPreviewLayout({ width: 0, height: 0 });
    expect(art.width).toBeGreaterThan(0);
    expect(art.height).toBeGreaterThan(0);
  });
});

describe("ogBackdropSampleSize", () => {
  it("копия под размытие держит пропорции кадра", () => {
    const sample = ogBackdropSampleSize();
    expect(sample.width / sample.height).toBeCloseTo(
      OG_PREVIEW_WIDTH / OG_PREVIEW_HEIGHT,
      1,
    );
  });

  it("копия сильно меньше кадра — размытие стоит квадрат радиуса", () => {
    expect(ogBackdropSampleSize().width).toBeLessThan(OG_PREVIEW_WIDTH / 4);
  });
});
