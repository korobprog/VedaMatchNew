import {
  parseMediaAudiobookPage,
  parseMediaAudiobooks,
  parseMediaCatalog,
  parseMediaStreamUrl,
  parseMediaTrack,
  parseMediaTrackPage,
  safeCoverUrl,
} from './media-parse';

/** Карточка записи ровно в том виде, в каком её собирает `toMusicTrackDto`. */
const dto = {
  id: 't1',
  title: 'Шри Гуруваштака',
  artist: { id: 'a1', slug: 'kirtan', name: 'Мадхава дас' },
  album: { id: 'al1', slug: 'live', title: 'Живой киртан' },
  categories: [{ id: 'c1', slug: 'kirtan', title: 'Киртан' }],
  durationSeconds: 412,
  coverUrl: 'https://s3.example.com/covers/t1.jpg',
  language: 'sa',
  isLiveRecording: true,
  lineage: null,
  playCount: 7,
  publishedAt: '2026-09-01T10:00:00.000Z',
};

describe('parseMediaTrack', () => {
  it('берёт из карточки то, что нужно списку и шторке', () => {
    expect(parseMediaTrack(dto)).toEqual({
      id: 't1',
      title: 'Шри Гуруваштака',
      artist: 'Мадхава дас',
      album: 'Живой киртан',
      coverUrl: 'https://s3.example.com/covers/t1.jpg',
      durationSeconds: 412,
    });
  });

  it('без id или названия записи нет', () => {
    expect(parseMediaTrack({ ...dto, id: '' })).toBeNull();
    expect(parseMediaTrack({ ...dto, title: '   ' })).toBeNull();
    expect(parseMediaTrack(null)).toBeNull();
    expect(parseMediaTrack([dto])).toBeNull();
  });

  it('без исполнителя и альбома — пустые строки не выдумываются', () => {
    const track = parseMediaTrack({ ...dto, artist: null, album: null });
    expect(track?.artist).toBeNull();
    expect(track?.album).toBeNull();
  });

  it('кривая длительность — ноль, а не NaN', () => {
    expect(parseMediaTrack({ ...dto, durationSeconds: 'много' })?.durationSeconds).toBe(0);
    expect(parseMediaTrack({ ...dto, durationSeconds: -3 })?.durationSeconds).toBe(0);
    expect(parseMediaTrack({ ...dto, durationSeconds: 12.7 })?.durationSeconds).toBe(12);
  });
});

describe('safeCoverUrl', () => {
  it('только https — картинку грузит уведомление', () => {
    expect(safeCoverUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(safeCoverUrl('http://cdn.example.com/a.jpg')).toBeNull();
    expect(safeCoverUrl('javascript:alert(1)')).toBeNull();
    expect(safeCoverUrl('/covers/a.jpg')).toBeNull();
    expect(safeCoverUrl(42)).toBeNull();
  });
});

describe('parseMediaTrackPage', () => {
  it('записи и курсор следующей порции', () => {
    expect(parseMediaTrackPage({ items: [dto], nextCursor: 't1' })).toEqual({
      items: [expect.objectContaining({ id: 't1' })],
      nextCursor: 't1',
    });
  });

  it('кривая запись выпадает, остальные остаются; повтор — один раз', () => {
    const page = parseMediaTrackPage({ items: [dto, { title: 'без id' }, dto, { ...dto, id: 't2' }], nextCursor: null });
    expect(page.items.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(page.nextCursor).toBeNull();
  });

  it('не объект — пустая последняя порция', () => {
    expect(parseMediaTrackPage('502 Bad Gateway')).toEqual({ items: [], nextCursor: null });
    expect(parseMediaTrackPage({ items: 'нет' })).toEqual({ items: [], nextCursor: null });
  });
});

describe('parseMediaCatalog', () => {
  it('разделы по позиции, незнакомый вид — стиль', () => {
    const catalog = parseMediaCatalog({
      categories: [
        { id: '2', slug: 'bhajan', title: 'Бхаджан', position: 2, kind: 'style', trackCount: 4 },
        { id: '1', slug: 'traditional', title: 'Традиционное', position: 0, kind: 'root', trackCount: 10 },
        { id: '3', slug: 'x', title: 'Новый вид', position: 1, kind: 'mood', trackCount: 1 },
        { id: '', slug: 'broken', title: 'Без id' },
      ],
      totalTracks: 14,
    });
    expect(catalog.categories.map((c) => [c.slug, c.kind])).toEqual([
      ['traditional', 'root'],
      ['x', 'style'],
      ['bhajan', 'style'],
    ]);
    expect(catalog.totalTracks).toBe(14);
  });

  it('пустой ответ — пустой каталог', () => {
    expect(parseMediaCatalog(null)).toEqual({ categories: [], totalTracks: 0 });
  });
});

describe('аудиокниги', () => {
  const book = {
    id: 'b1',
    slug: 'gita',
    title: 'Бхагавад-гита',
    author: 'Вьясадева',
    reader: { id: 'r1', slug: 'reader', name: 'Чтец' },
    coverUrl: 'https://cdn.example.com/gita.jpg',
    chapterCount: 18,
  };

  it('список книг без пустых', () => {
    expect(parseMediaAudiobooks({ books: [book, { ...book, id: 'b2', chapterCount: 0 }] })).toEqual([
      { id: 'b1', slug: 'gita', title: 'Бхагавад-гита', author: 'Вьясадева', reader: 'Чтец', coverUrl: book.coverUrl, chapterCount: 18 },
    ]);
    expect(parseMediaAudiobooks({})).toEqual([]);
  });

  it('у главы без своей обложки — обложка и название книги', () => {
    const page = parseMediaAudiobookPage({
      book: { ...book, description: 'Беседа Кришны и Арджуны' },
      chapters: [{ ...dto, id: 'ch1', album: null, coverUrl: null }],
      resume: null,
    });
    expect(page?.book.description).toBe('Беседа Кришны и Арджуны');
    expect(page?.chapters[0]).toMatchObject({ id: 'ch1', album: 'Бхагавад-гита', coverUrl: book.coverUrl });
  });

  it('книга без обязательных полей — нет страницы', () => {
    expect(parseMediaAudiobookPage({ book: { id: 'b1' }, chapters: [] })).toBeNull();
  });
});

describe('parseMediaStreamUrl', () => {
  it('ссылка и срок жизни', () => {
    expect(parseMediaStreamUrl({ url: 'https://s3.example.com/a.mp3?X-Amz=1', expiresInSeconds: 21600 })).toEqual({
      url: 'https://s3.example.com/a.mp3?X-Amz=1',
      expiresInSeconds: 21600,
    });
  });

  it('без ссылки играть нечего — ошибка, а не пустая строка в плеер', () => {
    expect(() => parseMediaStreamUrl({ expiresInSeconds: 1 })).toThrow('stream_url_missing');
    expect(() => parseMediaStreamUrl({ url: 'file:///etc/passwd' })).toThrow('stream_url_missing');
    expect(() => parseMediaStreamUrl(null)).toThrow('stream_url_missing');
  });
});
