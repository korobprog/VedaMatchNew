/* VED-686: альбом личной страницы. */
import {
  BLOG_ALBUM_CAPTION_MAX_LENGTH,
  BLOG_ALBUM_MAX_PHOTOS,
  BLOG_IMAGE_MAX_BYTES,
} from '@vedamatch/shared';
import { albumFileDenial, parseAlbumCaption } from './blog-album';

describe('parseAlbumCaption', () => {
  it('обрезает пробелы по краям', () => {
    expect(parseAlbumCaption({ caption: '  Храм  ' })).toBe('Храм');
  });

  it('схлопывает больше двух переводов строки', () => {
    expect(parseAlbumCaption({ caption: 'а\n\n\n\nб' })).toBe('а\n\nб');
  });

  it('пустая строка стирает подпись', () => {
    expect(parseAlbumCaption({ caption: '   ' })).toBeNull();
  });

  it('не строка или нет поля — caption_invalid', () => {
    for (const body of [{}, { caption: 5 }, null, undefined]) {
      expect(() => parseAlbumCaption(body)).toThrow('caption_invalid');
    }
  });

  it('длиннее предела — caption_too_long', () => {
    const caption = 'я'.repeat(BLOG_ALBUM_CAPTION_MAX_LENGTH + 1);
    expect(() => parseAlbumCaption({ caption })).toThrow('caption_too_long');
    expect(
      parseAlbumCaption({ caption: 'я'.repeat(BLOG_ALBUM_CAPTION_MAX_LENGTH) }),
    ).not.toBeNull();
  });
});

describe('albumFileDenial', () => {
  const photo = { mimetype: 'image/jpeg', size: 1000 };

  it('принимает фото', () => {
    expect(albumFileDenial(photo, 0)).toBeNull();
  });

  it('не принимает неизвестный тип', () => {
    expect(albumFileDenial({ mimetype: 'text/plain', size: 1 }, 0)).toBe(
      'unsupported_type',
    );
  });

  it('не принимает слишком большое фото', () => {
    expect(
      albumFileDenial({ ...photo, size: BLOG_IMAGE_MAX_BYTES + 1 }, 0),
    ).toBe('file_too_large');
  });

  it('не принимает ролик', () => {
    expect(albumFileDenial({ mimetype: 'video/mp4', size: 1000 }, 0)).toBe(
      'album_photo_only',
    );
  });

  it('при полном альбоме отвечает album_full', () => {
    expect(albumFileDenial(photo, BLOG_ALBUM_MAX_PHOTOS - 1)).toBeNull();
    expect(albumFileDenial(photo, BLOG_ALBUM_MAX_PHOTOS)).toBe('album_full');
  });
});
