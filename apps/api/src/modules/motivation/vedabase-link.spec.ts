import { libraryLinkFromAttribution } from './vedabase-link';

describe('libraryLinkFromAttribution (VED-142)', () => {
  it('номер стиха прямо в подписи источника — как у ручных публикаций на проде', () => {
    expect(libraryLinkFromAttribution('Бхагавад-гита 2.14', null)).toEqual({
      bookSlug: 'bhagavad-gita',
      chapterSlug: '2',
    });
  });

  it('номер стиха в отдельном поле', () => {
    expect(
      libraryLinkFromAttribution('Бхагавад-гита как она есть', '18.66'),
    ).toEqual({ bookSlug: 'bhagavad-gita', chapterSlug: '18' });
  });

  it('понимает «глава 3» и латинское написание', () => {
    expect(libraryLinkFromAttribution('Бхагавад-гита, глава 3', null)).toEqual({
      bookSlug: 'bhagavad-gita',
      chapterSlug: '3',
    });
    expect(libraryLinkFromAttribution('Bhagavad-gita', '4:7')).toEqual({
      bookSlug: 'bhagavad-gita',
      chapterSlug: '4',
    });
  });

  it('глава вне 1–18 или без номера — ссылки нет', () => {
    expect(libraryLinkFromAttribution('Бхагавад-гита 19.1', null)).toBeNull();
    expect(libraryLinkFromAttribution('Бхагавад-гита', null)).toBeNull();
  });

  it('другие книги не угадываем', () => {
    expect(libraryLinkFromAttribution('Шримад-Бхагаватам', '1.2.6')).toBeNull();
    expect(libraryLinkFromAttribution('Шри Ишопанишад', '1')).toBeNull();
    expect(libraryLinkFromAttribution(null, null)).toBeNull();
  });
});
