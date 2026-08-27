import sharp from 'sharp';
import {
  MAX_IMAGE_DIMENSION,
  isDirectUrl,
  isShrunkStorageKey,
  needsShrink,
  shrunkStorageKey,
  toStorageImage,
} from './gallery-image';

/** Кадр заданных сторон, шумом — чтобы его нельзя было сжать в ничто. */
const frame = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

describe('toStorageImage', () => {
  it('ужимает кадр с телефона до предела, сохраняя пропорции', async () => {
    const image = await toStorageImage(await frame(4032, 3024));
    expect(image).toMatchObject({ width: MAX_IMAGE_DIMENSION, height: 1200 });
  });

  it('предел считается по длинной стороне, а не по ширине', async () => {
    // Портрет с телефона выше, чем шире: ограничив только ширину, мы пропустили
    // бы в хранилище кадр вдвое тяжелее нужного.
    const image = await toStorageImage(await frame(3024, 4032));
    expect(image).toMatchObject({ width: 1200, height: MAX_IMAGE_DIMENSION });
  });

  it('не растягивает снимок меньше предела', async () => {
    const image = await toStorageImage(await frame(800, 600));
    expect(image).toMatchObject({ width: 800, height: 600 });
  });

  it('кадр с телефона становится заметно легче', async () => {
    // То, ради чего всё затевалось: карточка шириной 360px тянула оригинал.
    const source = await frame(4032, 3024);
    const image = await toStorageImage(source);
    expect(image.data.length).toBeLessThan(source.length / 4);
  });

  it('применяет EXIF-поворот до предела', async () => {
    // Иначе у повёрнутого кадра ограничили бы не ту сторону.
    const source = await sharp({
      create: { width: 3024, height: 4032, channels: 3, background: '#ff0000' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const image = await toStorageImage(source);
    expect(image.width).toBe(MAX_IMAGE_DIMENSION);
    expect(image.height).toBe(1200);
  });
});

describe('needsShrink', () => {
  it.each([
    [4032, 3024, true],
    [3024, 4032, true],
    [MAX_IMAGE_DIMENSION + 1, 10, true],
    [MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, false],
    [800, 600, false],
  ])('%i×%i → %s', (width, height, expected) => {
    expect(needsShrink(width, height)).toBe(expected);
  });
});

describe('shrunkStorageKey', () => {
  it('кладёт копию рядом с оригиналом, сохраняя расширение', () => {
    // Оригинал остаётся на месте: проход обязан быть обратимым.
    expect(shrunkStorageKey('users/u1/gallery/abc.webp')).toBe(
      'users/u1/gallery/abc-w1600.webp',
    );
  });

  it('второй проход не плодит копий', () => {
    const once = shrunkStorageKey('users/u1/gallery/abc.webp');
    expect(shrunkStorageKey(once)).toBe(once);
    expect(isShrunkStorageKey(once)).toBe(true);
  });

  it('ключ без расширения тоже получает суффикс, а не точку в середине', () => {
    expect(shrunkStorageKey('users/u1/gallery/abc')).toBe(
      'users/u1/gallery/abc-w1600',
    );
  });

  it('точка в имени папки за расширение не считается', () => {
    expect(shrunkStorageKey('users/u.1/gallery/abc')).toBe(
      'users/u.1/gallery/abc-w1600',
    );
  });
});

describe('isDirectUrl', () => {
  it.each([
    ['/mock/union/govinda-1.svg', true],
    ['https://cdn.test/a.webp', true],
    ['http://cdn.test/a.webp', true],
    ['users/u1/gallery/abc.webp', false],
  ])('%s → %s', (key, expected) => {
    expect(isDirectUrl(key)).toBe(expected);
  });
});
