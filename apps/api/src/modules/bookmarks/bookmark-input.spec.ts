import {
  BookmarkInputError,
  normalizeBookmarkPath,
  normalizeBookmarkTitle,
  serviceFromBookmarkPath,
} from './bookmark-input';

describe('normalizeBookmarkPath', () => {
  it('оставляет путь портала как есть', () => {
    expect(normalizeBookmarkPath('/music/artists/prabhupada')).toBe(
      '/music/artists/prabhupada',
    );
  });

  it('сохраняет запрос: страница с фильтром — другая страница', () => {
    expect(normalizeBookmarkPath('/work?board=main')).toBe('/work?board=main');
  });

  it('отбрасывает якорь', () => {
    expect(normalizeBookmarkPath('/library/book/1#chapter-3')).toBe(
      '/library/book/1',
    );
  });

  it('снимает хвостовую косую черту, но не у корня', () => {
    expect(normalizeBookmarkPath('/music/')).toBe('/music');
    expect(normalizeBookmarkPath('/')).toBe('/');
  });

  it('обрезает пробелы по краям', () => {
    expect(normalizeBookmarkPath('  /market  ')).toBe('/market');
  });

  it.each([
    ['без ведущей косой', 'music/artists'],
    ['абсолютный адрес', 'https://example.com/'],
    ['протокол-относительный', '//example.com/phish'],
    ['обратная косая — тот же уход с портала', '/\\example.com'],
    ['перевод строки внутри', '/music\n/artists'],
    ['пустая строка', ''],
    ['не строка', 42],
  ])('не принимает %s', (_name, input) => {
    expect(() => normalizeBookmarkPath(input)).toThrow(BookmarkInputError);
  });

  it('не принимает слишком длинный путь', () => {
    expect(() => normalizeBookmarkPath(`/${'a'.repeat(600)}`)).toThrow(
      BookmarkInputError,
    );
  });
});

describe('serviceFromBookmarkPath', () => {
  it('берёт первый сегмент', () => {
    expect(serviceFromBookmarkPath('/music/artists/1')).toBe('music');
    expect(serviceFromBookmarkPath('/work')).toBe('work');
  });

  it('у корня раздела нет', () => {
    expect(serviceFromBookmarkPath('/')).toBe('');
  });

  it('отрезает запрос от первого сегмента', () => {
    expect(serviceFromBookmarkPath('/search?q=veda')).toBe('search');
  });

  it('незнакомую форму сегмента считает отсутствием раздела', () => {
    expect(serviceFromBookmarkPath('/Music')).toBe('');
  });
});

describe('normalizeBookmarkTitle', () => {
  it('схлопывает пробелы и переводы строк', () => {
    expect(normalizeBookmarkTitle(' Шрила\n  Прабхупада ')).toBe(
      'Шрила Прабхупада',
    );
  });

  it('режет по длине', () => {
    expect(normalizeBookmarkTitle('я'.repeat(200))).toHaveLength(120);
  });

  it.each([
    ['пустую', '   '],
    ['не строку', null],
  ])('не принимает %s подпись', (_name, input) => {
    expect(() => normalizeBookmarkTitle(input)).toThrow(BookmarkInputError);
  });
});
