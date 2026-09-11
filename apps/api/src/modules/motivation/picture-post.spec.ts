import {
  PICTURE_AUTHOR_MAX,
  PICTURE_TEXT_MAX,
  normalizePictureInput,
  pictureImageKey,
  pictureTitle,
} from './picture-post';

describe('normalizePictureInput', () => {
  it('reads the multipart fields and trims them', () => {
    expect(
      normalizePictureInput({
        category: '  shastra ',
        text: '  Кто видит меня везде  ',
        author: ' Шри Кришна ',
      }),
    ).toEqual({
      category: 'shastra',
      text: 'Кто видит меня везде',
      author: 'Шри Кришна',
    });
  });

  // Картинку можно положить и без набранного текста: он уже на ней.
  it('lets text, author and category be empty', () => {
    expect(normalizePictureInput({})).toEqual({
      category: undefined,
      text: '',
      author: '',
    });
    expect(normalizePictureInput(undefined)).toEqual({
      category: undefined,
      text: '',
      author: '',
    });
  });

  it('keeps the line breaks of a verse but not the extra blank lines', () => {
    const input = normalizePictureInput({
      text: 'Первая строка\r\n  вторая   строка\n\n\n\nтретья',
    });
    expect(input).toMatchObject({
      text: 'Первая строка\nвторая строка\n\nтретья',
    });
  });

  it('ignores fields that are not strings', () => {
    expect(
      normalizePictureInput({ category: ['a'], text: 7, author: null }),
    ).toEqual({ category: undefined, text: '', author: '' });
  });

  it('refuses a text or an author that is too long', () => {
    expect(
      normalizePictureInput({ text: 'а'.repeat(PICTURE_TEXT_MAX + 1) }),
    ).toBe('text_too_long');
    expect(
      normalizePictureInput({ author: 'а'.repeat(PICTURE_AUTHOR_MAX + 1) }),
    ).toBe('author_too_long');
  });
});

describe('pictureTitle', () => {
  it('takes the first line of the quote', () => {
    expect(pictureTitle('Кто видит меня везде\nи всё во мне', 'Шастры')).toBe(
      'Кто видит меня везде',
    );
  });

  // В списке опубликованного пустая строка вместо заголовка — потерянный пост.
  it('names the category when there is no text', () => {
    expect(pictureTitle('', 'Шастры')).toBe('Картинка из раздела «Шастры»');
  });

  it('cuts a long line on a word', () => {
    const title = pictureTitle(
      'Тот, кто видит меня везде и видит всё во мне, никогда не теряет меня, и я никогда не теряю его',
      'Шастры',
    );
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(81);
    expect(title).not.toMatch(/\s…$/);
  });
});

describe('pictureImageKey', () => {
  it('keeps pictures apart from cropped reel frames', () => {
    expect(pictureImageKey('p1', 5)).toBe('motivation/pictures/p1/v5.webp');
  });
});
