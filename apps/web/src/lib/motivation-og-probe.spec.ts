// @vitest-environment node
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROBE_HEAD_BYTES,
  clearProbeCache,
  imageSizeFromHeader,
  probeImageSize,
} from "./motivation-og-probe";

/**
 * VED-357. Страница объявляет `og:image:width/height` по размеру исходника,
 * прочитанному из начала файла, а маршрут превью меряет тот же файл через
 * sharp. Если заголовок прочитан неверно, объявленный размер соврёт, поэтому
 * эталон здесь — сам sharp: файлы собираются им же, ответ сверяется с
 * `metadata().autoOrient`, то есть с тем, что увидит маршрут.
 */

const blank = (width: number, height: number, alpha = false) =>
  sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha
        ? { r: 200, g: 120, b: 40, alpha: 0.5 }
        : { r: 200, g: 120, b: 40 },
    },
  });

async function expectSameAsSharp(file: Buffer) {
  const meta = await sharp(file).metadata();
  expect(imageSizeFromHeader(file.subarray(0, PROBE_HEAD_BYTES))).toEqual({
    width: meta.autoOrient.width,
    height: meta.autoOrient.height,
  });
}

describe("imageSizeFromHeader", () => {
  it("PNG — иллюстрация рилса", async () => {
    await expectSameAsSharp(await blank(1024, 1536).png().toBuffer());
  });

  it("WebP с потерями — открытка из загрузки", async () => {
    await expectSameAsSharp(await blank(1000, 750).webp({ quality: 88 }).toBuffer());
  });

  it("WebP без потерь", async () => {
    await expectSameAsSharp(await blank(777, 333).webp({ lossless: true }).toBuffer());
  });

  it("WebP с прозрачностью (расширенный заголовок)", async () => {
    await expectSameAsSharp(await blank(640, 960, true).webp().toBuffer());
  });

  it("JPEG без поворота", async () => {
    await expectSameAsSharp(await blank(1600, 1200).jpeg().toBuffer());
  });

  it("JPEG с телефона, повёрнутый по EXIF, — ширина с высотой меняются", async () => {
    const file = await blank(1600, 1200)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(imageSizeFromHeader(file)).toEqual({ width: 1200, height: 1600 });
    await expectSameAsSharp(file);
  });

  it("JPEG с EXIF-ориентацией без поворота на четверть — размер как есть", async () => {
    const file = await blank(1600, 1200)
      .jpeg()
      .withMetadata({ orientation: 3 })
      .toBuffer();
    await expectSameAsSharp(file);
  });

  it("GIF", async () => {
    await expectSameAsSharp(await blank(300, 200).gif().toBuffer());
  });

  it("обрывок заголовка и чужой формат — null, а не выдумка", async () => {
    const png = await blank(10, 10).png().toBuffer();
    expect(imageSizeFromHeader(png.subarray(0, 16))).toBeNull();
    expect(imageSizeFromHeader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(imageSizeFromHeader(new Uint8Array())).toBeNull();
    const jpeg = await blank(10, 10).jpeg().toBuffer();
    expect(imageSizeFromHeader(jpeg.subarray(0, 20))).toBeNull();
  });
});

describe("probeImageSize", () => {
  afterEach(() => clearProbeCache());

  const respond = (body: Uint8Array, status = 206) =>
    new Response(new Blob([new Uint8Array(body)]).stream(), { status });

  it("просит только начало файла и читает размер", async () => {
    const file = await blank(1024, 1536).png().toBuffer();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Range")).toBe(
        `bytes=0-${PROBE_HEAD_BYTES - 1}`,
      );
      return respond(file.subarray(0, PROBE_HEAD_BYTES));
    });
    await expect(
      probeImageSize("https://s3/a.png", fetchImpl as typeof fetch),
    ).resolves.toEqual({ width: 1024, height: 1536 });
  });

  it("хранилище без Range отдаёт файл целиком — размер всё равно читается", async () => {
    const file = await blank(900, 600).jpeg().toBuffer();
    const fetchImpl = vi.fn(async () => respond(file, 200));
    await expect(
      probeImageSize("https://s3/b.jpg", fetchImpl as typeof fetch),
    ).resolves.toEqual({ width: 900, height: 600 });
  });

  it("удачный размер запоминает: второй раз в хранилище не ходит", async () => {
    const file = await blank(500, 700).png().toBuffer();
    const fetchImpl = vi.fn(async () => respond(file));
    await probeImageSize("https://s3/c.png", fetchImpl as typeof fetch);
    await probeImageSize("https://s3/c.png", fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ошибка хранилища, сеть или мусор — null, без исключения", async () => {
    await expect(
      probeImageSize(
        "https://s3/d.png",
        (async () => new Response("nope", { status: 404 })) as typeof fetch,
      ),
    ).resolves.toBeNull();
    await expect(
      probeImageSize(
        "https://s3/e.png",
        (async () => {
          throw new Error("offline");
        }) as typeof fetch,
      ),
    ).resolves.toBeNull();
    await expect(
      probeImageSize(
        "https://s3/f.png",
        (async () => respond(new Uint8Array([1, 2, 3]))) as typeof fetch,
      ),
    ).resolves.toBeNull();
  });

  it("неудачу не запоминает — хранилище могло моргнуть", async () => {
    const file = await blank(500, 700).png().toBuffer();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1 ? new Response("", { status: 503 }) : respond(file);
    }) as typeof fetch;
    await expect(probeImageSize("https://s3/g.png", fetchImpl)).resolves.toBeNull();
    await expect(probeImageSize("https://s3/g.png", fetchImpl)).resolves.toEqual({
      width: 500,
      height: 700,
    });
  });
});
