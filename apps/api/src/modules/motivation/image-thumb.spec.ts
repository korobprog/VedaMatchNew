import sharp from 'sharp';
import {
  backfillThumbKey,
  backfillWebKey,
  IMAGE_WEB_QUALITY,
  IMAGE_THUMB_WIDTH,
  imageKeyFromUrl,
  renderImageThumb,
  renderImageWeb,
  thumbKeyForImageKey,
  thumbSize,
  webKeyForImageKey,
} from './image-thumb';

function png(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe('thumbSize', () => {
  it('уменьшает сгенерированный кадр 1024×1536 до 720 по ширине', () => {
    expect(thumbSize(1024, 1536)).toEqual({ width: 720, height: 1080 });
  });

  it('кадр рилса 1080×1920 — в 720×1280', () => {
    expect(thumbSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });

  it('узкий оригинал не растягивает', () => {
    expect(thumbSize(600, 900)).toEqual({ width: 600, height: 900 });
    expect(thumbSize(720, 100)).toEqual({ width: 720, height: 100 });
  });

  it('высота не схлопывается в ноль у очень широкой картинки', () => {
    expect(thumbSize(100_000, 10)).toEqual({ width: 720, height: 1 });
  });

  it('пустой размер — ошибка, а не картинка 0×0', () => {
    expect(() => thumbSize(0, 100)).toThrow();
    expect(() => thumbSize(100, Number.NaN)).toThrow();
  });
});

describe('thumbKeyForImageKey', () => {
  it('кладёт копию рядом с оригиналом, меняя расширение', () => {
    expect(thumbKeyForImageKey('motivation/2026-09-28/p1/v123.png')).toBe(
      'motivation/2026-09-28/p1/v123-w720.webp',
    );
    expect(thumbKeyForImageKey('motivation/uploads/p1/v5.webp')).toBe(
      'motivation/uploads/p1/v5-w720.webp',
    );
  });

  it('точка в папке — не расширение', () => {
    expect(thumbKeyForImageKey('a.b/c/v1')).toBe('a.b/c/v1-w720.webp');
  });
});

describe('imageKeyFromUrl', () => {
  const base = 'https://cdn.example.com/bucket/';

  it('достаёт ключ из ссылки нашего хранилища', () => {
    expect(
      imageKeyFromUrl(
        'https://cdn.example.com/bucket/motivation/x/v1.png',
        base,
      ),
    ).toBe('motivation/x/v1.png');
  });

  it('отрезает query и hash', () => {
    expect(
      imageKeyFromUrl(
        'https://cdn.example.com/bucket/motivation/x/v1.png?x=1#y',
        base,
      ),
    ).toBe('motivation/x/v1.png');
  });

  it('чужая ссылка и пустая база — null', () => {
    expect(imageKeyFromUrl('https://other.host/motivation/x.png', base)).toBe(
      null,
    );
    expect(imageKeyFromUrl('https://cdn.example.com/bucketX/x.png', base)).toBe(
      null,
    );
    expect(imageKeyFromUrl('https://cdn.example.com/x.png', '')).toBe(null);
  });
});

describe('backfillThumbKey', () => {
  it('для своей ссылки — рядом с оригиналом', () => {
    expect(
      backfillThumbKey(
        'https://cdn.test/motivation/d/p1/v9.png',
        'https://cdn.test',
        'p1',
        42,
      ),
    ).toBe('motivation/d/p1/v9-w720.webp');
  });

  it('для чужой — в папке копий поста с версией', () => {
    expect(
      backfillThumbKey('https://elsewhere/x.png', 'https://cdn.test', 'p1', 42),
    ).toBe('motivation/thumbs/p1/v42-w720.webp');
  });
});

describe('renderImageThumb', () => {
  it('делает WebP 720 по ширине и в разы легче PNG', async () => {
    const original = await png(1024, 1536);
    const thumb = await renderImageThumb(original);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(IMAGE_THUMB_WIDTH);
    expect(meta.height).toBe(1080);
    expect(thumb.length).toBeLessThan(original.length);
  });

  it('маленькую картинку не увеличивает', async () => {
    const meta = await sharp(
      await renderImageThumb(await png(400, 600)),
    ).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(600);
  });

  it('учитывает поворот из EXIF', async () => {
    // Снято «боком»: в пикселях 1536×1024, а по EXIF показывать стоя.
    const rotated = await sharp(await png(1536, 1024))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await renderImageThumb(rotated)).metadata();
    expect(meta.width).toBe(720);
    expect(meta.height).toBe(1080);
  });

  it('не картинка — ошибка', async () => {
    await expect(renderImageThumb(Buffer.from('png'))).rejects.toThrow();
  });
});

describe('webKeyForImageKey', () => {
  it('заменяет расширение оригинала на -web.webp', () => {
    expect(webKeyForImageKey('motivation/2026-09-01/p1/v123.png')).toBe(
      'motivation/2026-09-01/p1/v123-web.webp',
    );
  });

  it('точка в папке не считается расширением', () => {
    expect(webKeyForImageKey('motivation/v1.5/p1/file')).toBe(
      'motivation/v1.5/p1/file-web.webp',
    );
  });
});

describe('backfillWebKey', () => {
  it('своя ссылка — ключ рядом с оригиналом', () => {
    expect(
      backfillWebKey(
        'https://cdn.test/motivation/d/p1/v1.png',
        'https://cdn.test',
        'p1',
        7,
      ),
    ).toBe('motivation/d/p1/v1-web.webp');
  });

  it('чужая ссылка — отдельная папка поста с версией', () => {
    expect(
      backfillWebKey(
        'https://other.example/a.png',
        'https://cdn.test',
        'p1',
        7,
      ),
    ).toBe('motivation/web/p1/v7-web.webp');
  });
});

describe('renderImageWeb', () => {
  it('оставляет размер 1024×1536 и отдаёт WebP', async () => {
    const out = await renderImageWeb(await png(1024, 1536));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([1024, 1536]);
    expect(IMAGE_WEB_QUALITY).toBe(88);
  });

  it('узкий кадр не увеличивает', async () => {
    const meta = await sharp(
      await renderImageWeb(await png(300, 400)),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([300, 400]);
  });
});
