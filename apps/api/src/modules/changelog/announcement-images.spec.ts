import { ANNOUNCEMENT_MAX_IMAGES } from '@vedamatch/shared';
import {
  AnnouncementImagesError,
  normalizeAnnouncementImages,
} from './announcement-images';

const key = (n: number) =>
  `announcements/0000000${n}-aaaa-4bbb-8ccc-dddddddddddd.webp`;

describe('normalizeAnnouncementImages (VED-137)', () => {
  it('возвращает картинки в присланном порядке', () => {
    expect(
      normalizeAnnouncementImages([
        { key: key(2), width: 1280, height: 720 },
        { key: key(1), width: 800, height: 1600 },
      ]),
    ).toEqual([
      { key: key(2), width: 1280, height: 720 },
      { key: key(1), width: 800, height: 1600 },
    ]);
  });

  it('пустой список — убрать все картинки', () => {
    expect(normalizeAnnouncementImages([])).toEqual([]);
  });

  it('не принимает чужие объекты бакета', () => {
    for (const bad of [
      'users/1/photo.webp',
      'announcements/../users/1.webp',
      'announcements/not-a-uuid.webp',
      `${key(1)}.png`,
    ]) {
      expect(() =>
        normalizeAnnouncementImages([{ key: bad, width: 10, height: 10 }]),
      ).toThrow(AnnouncementImagesError);
    }
  });

  it('не больше предела картинок', () => {
    const many = Array.from(
      { length: ANNOUNCEMENT_MAX_IMAGES + 1 },
      (_, i) => ({
        key: key(i),
        width: 10,
        height: 10,
      }),
    );
    expect(() => normalizeAnnouncementImages(many)).toThrow(
      `Не больше ${ANNOUNCEMENT_MAX_IMAGES} картинок в новости`,
    );
  });

  it('одну картинку дважды не добавить', () => {
    expect(() =>
      normalizeAnnouncementImages([
        { key: key(1), width: 10, height: 10 },
        { key: key(1), width: 10, height: 10 },
      ]),
    ).toThrow('Одна картинка добавлена дважды');
  });

  it('размеры — целые положительные числа', () => {
    for (const [width, height] of [
      [0, 10],
      [10.5, 10],
      ['10', 10],
      [10, 20_000],
    ]) {
      expect(() =>
        normalizeAnnouncementImages([{ key: key(1), width, height }]),
      ).toThrow('У картинки неверный размер');
    }
  });

  it('не список — ошибка, а не падение', () => {
    expect(() => normalizeAnnouncementImages('x')).toThrow(
      AnnouncementImagesError,
    );
  });
});
