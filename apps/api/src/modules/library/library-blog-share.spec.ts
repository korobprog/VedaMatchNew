import {
  LIBRARY_BLOG_LINK_LABEL,
  libraryBlogShareEvent,
  pickBlogShareResult,
} from './library-blog-share';

describe('libraryBlogShareEvent', () => {
  const entry = {
    id: 'e1',
    titleRu: ' Настоящая проповедь ',
    titleEn: 'True preaching',
    descriptionRu: '',
    descriptionEn: 'About preaching',
    source: null,
    previewUrl: 'https://media.example/cover.webp',
  };

  it('берёт русское, а без него — английское; адрес — страница материала', () => {
    expect(libraryBlogShareEvent(entry, { id: 'u1', isAdmin: true })).toEqual({
      requesterId: 'u1',
      requesterIsAdmin: true,
      entryId: 'e1',
      title: 'Настоящая проповедь',
      text: 'About preaching',
      url: '/library/entry/e1',
      imageUrl: 'https://media.example/cover.webp',
      label: LIBRARY_BLOG_LINK_LABEL,
    });
  });

  it('без описания текстом идёт источник, без всего — пусто', () => {
    const bare = {
      ...entry,
      titleRu: null,
      titleEn: null,
      descriptionEn: null,
      source: 'Бхагавад-гита 9.22',
      previewUrl: null,
    };
    const event = libraryBlogShareEvent(bare, { id: 'u1', isAdmin: false });
    expect(event.title).toBeNull();
    expect(event.text).toBe('Бхагавад-гита 9.22');
    expect(
      libraryBlogShareEvent(
        { ...bare, source: null },
        { id: 'u1', isAdmin: false },
      ).text,
    ).toBe('');
  });
});

describe('pickBlogShareResult', () => {
  it('берёт ответ ленты и пропускает чужие', () => {
    expect(
      pickBlogShareResult([undefined, 'x', { ok: true, postId: 'p1' }]),
    ).toEqual({ ok: true, postId: 'p1' });
    expect(
      pickBlogShareResult([{ ok: false, reason: 'daily_limit_reached' }]),
    ).toEqual({ ok: false, reason: 'daily_limit_reached' });
  });

  it('никто не ответил — null', () => {
    expect(pickBlogShareResult([])).toBeNull();
    expect(pickBlogShareResult([{ ok: true }])).toBeNull();
  });
});
