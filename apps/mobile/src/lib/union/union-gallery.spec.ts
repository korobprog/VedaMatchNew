import type { UserPhotoDto } from '@vedamatch/shared';
import {
  GALLERY_MAX_BYTES,
  canSearchCity,
  locationDetails,
  movePhoto,
  quotaLine,
  toGalleryUpload,
  toHomeLocation,
  uploadSummary,
} from './union-gallery';

const photo = (id: string, isPublic = true): UserPhotoDto => ({
  id,
  url: `https://s3/${id}.jpg`,
  thumbUrl: null,
  sizeBytes: 1000,
  width: 800,
  height: 1000,
  isPublic,
  sortOrder: 0,
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
});

describe('загрузка фото', () => {
  it('JPEG, PNG и WebP проходят, имя — своё', () => {
    expect(toGalleryUpload({ uri: 'file:///x/ImagePicker-1.jpeg', mimeType: 'image/jpeg' }, 0)).toEqual({
      uri: 'file:///x/ImagePicker-1.jpeg',
      name: 'photo-1.jpg',
      type: 'image/jpeg',
    });
    expect(toGalleryUpload({ uri: 'file:///x/a.webp' }, 2)).toMatchObject({ name: 'photo-3.webp', type: 'image/webp' });
  });

  it('HEIC и GIF — отказ словами', () => {
    expect(toGalleryUpload({ uri: 'file:///x/a.heic', mimeType: 'image/heic' }, 0)).toMatch(/JPEG, PNG или WebP/);
    expect(toGalleryUpload({ uri: 'file:///x/a.gif' }, 0)).toMatch(/JPEG, PNG или WebP/);
  });

  it('больше 20 МБ — отказ', () => {
    expect(toGalleryUpload({ uri: 'file:///x/a.jpg', fileSize: GALLERY_MAX_BYTES + 1 }, 0)).toMatch(/20 МБ/);
  });

  it('итог — что загружено и что не прошло', () => {
    expect(
      uploadSummary({
        uploaded: [{ fileName: 'photo-1.jpg', photo: photo('a', false) }],
        failed: [{ fileName: 'photo-2.jpg', code: 'quota_exceeded', message: 'Место закончилось' }],
      }),
    ).toBe('Фото загружено, но скрыто от Знакомств — откройте его кнопкой «Показывать». photo-2.jpg: Место закончилось');
  });

  it('занятое место — по-русски, с запятой', () => {
    expect(quotaLine(3.2 * 1024 * 1024, 50 * 1024 * 1024)).toBe('3,2 МБ из 50,0 МБ');
  });
});

describe('порядок фото', () => {
  const photos = [photo('a'), photo('b'), photo('c')];

  it('вперёд и назад на одну позицию', () => {
    expect(movePhoto(photos, 'b', -1).map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(movePhoto(photos, 'b', 1).map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });

  it('«сделать главным» — в начало, за край не уходит', () => {
    expect(movePhoto(photos, 'c', -99).map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(movePhoto(photos, 'a', -1).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(movePhoto(photos, 'нет', 1).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('место жительства', () => {
  it('ищем, когда набраны и страна, и город', () => {
    expect(canSearchCity('Ка', 'Россия')).toBe(true);
    expect(canSearchCity('К', 'Россия')).toBe(false);
    expect(canSearchCity('Казань', ' ')).toBe(false);
  });

  it('уточнение без повтора города и страны', () => {
    expect(
      locationDetails({ city: 'Казань', country: 'Россия', lat: 1, lon: 2, displayName: 'Казань, Татарстан, Россия' }),
    ).toBe('Татарстан');
    expect(locationDetails({ city: 'Казань', lat: 1, lon: 2 })).toBe('');
  });

  it('страна — из подсказки, а без неё — набранная', () => {
    expect(toHomeLocation({ city: 'Маяпур', lat: 1, lon: 2 }, ' Индия ').country).toBe('Индия');
    expect(toHomeLocation({ city: 'Маяпур', country: 'India', lat: 1, lon: 2 }, 'Индия').country).toBe('India');
  });
});
