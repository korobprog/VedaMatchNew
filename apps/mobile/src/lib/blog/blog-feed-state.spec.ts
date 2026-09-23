import { blogPost } from './blog-fixtures';
import {
  BLOG_IMAGE_MAX_ASPECT,
  BLOG_IMAGE_MIN_ASPECT,
  blogAuthorCount,
  blogDateLine,
  blogImageAspect,
  blogImageCounter,
  blogImageIndex,
  blogMetaLine,
  blogRepostLabel,
  blogRestLabel,
  blogSourceMetaLine,
  blogTileTitle,
  countRepost,
  mergeBlogPages,
  prependBlogPost,
  removeBlogPost,
  replaceBlogPost,
  shownContent,
} from './blog-feed-state';

const now = new Date(2026, 8, 23, 12, 0);
const ids = (posts: { id: string }[]) => posts.map((post) => post.id);

describe('порядок и подгрузка', () => {
  it('следующая порция дописывается в конец в порядке сервера', () => {
    const merged = mergeBlogPages([blogPost('a'), blogPost('b')], [blogPost('c'), blogPost('d')]);
    expect(ids(merged)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('пост, который уже в ленте, второй раз не встаёт — иначе два ключа на одну строку', () => {
    // Свой пост уже сверху, а следующая порция приносит его же с сервера.
    const merged = mergeBlogPages([blogPost('mine'), blogPost('a')], [blogPost('b'), blogPost('mine')]);
    expect(ids(merged)).toEqual(['mine', 'a', 'b']);
  });

  it('повтор внутри одной порции тоже отбрасывается', () => {
    expect(ids(mergeBlogPages([], [blogPost('a'), blogPost('a')]))).toEqual(['a']);
  });

  it('клиент не пересортировывает ленту по дате: закреплённое остаётся наверху', () => {
    const pinnedOld = blogPost('pinned', { pinned: true, createdAt: new Date(2026, 0, 1).toISOString() });
    const fresh = blogPost('fresh', { createdAt: new Date(2026, 8, 22).toISOString() });
    expect(ids(mergeBlogPages([pinnedOld], [fresh]))).toEqual(['pinned', 'fresh']);
  });

  it('новый пост встаёт первым под закреплёнными — туда же его поставит сервер', () => {
    const list = [blogPost('p1', { pinned: true }), blogPost('p2', { pinned: true }), blogPost('a')];
    expect(ids(prependBlogPost(list, blogPost('new')))).toEqual(['p1', 'p2', 'new', 'a']);
  });

  it('в пустую ленту и в ленту из одних закреплённых — тоже на своё место', () => {
    expect(ids(prependBlogPost([], blogPost('new')))).toEqual(['new']);
    expect(ids(prependBlogPost([blogPost('p', { pinned: true })], blogPost('new')))).toEqual(['p', 'new']);
  });

  it('закреплённый новый пост — на самый верх; повтор не удваивается', () => {
    const list = [blogPost('p', { pinned: true }), blogPost('a')];
    expect(ids(prependBlogPost(list, blogPost('top', { pinned: true })))).toEqual(['top', 'p', 'a']);
    expect(ids(prependBlogPost(list, blogPost('a')))).toEqual(['p', 'a']);
  });

  it('удаляется только сам пост: чужие репосты сервер оставляет (SetNull)', () => {
    const source = blogPost('src');
    const repost = blogPost('rep', { repostOf: { ...source, author: source.author } });
    expect(ids(removeBlogPost([source, repost, blogPost('x')], 'src'))).toEqual(['rep', 'x']);
  });

  it('замена поста — на его месте', () => {
    const edited = blogPost('b', { title: 'Новый' });
    const list = replaceBlogPost([blogPost('a'), blogPost('b'), blogPost('c')], edited);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
    expect(list[1].title).toBe('Новый');
  });

  it('репост прибавляет счётчик оригиналу и никому больше', () => {
    const list = countRepost([blogPost('a', { repostCount: 2 }), blogPost('b')], 'a');
    expect(list.map((post) => post.repostCount)).toEqual([3, 0]);
  });
});

describe('что показывать', () => {
  const source = {
    id: 'src',
    author: { id: 'u-2', name: 'Радха деви даси', avatarUrl: null },
    title: 'Оригинал',
    text: 'Слова оригинала',
    images: [{ id: 'i1', url: 'https://cdn/i1.jpg', width: 800, height: 600 }],
    createdAt: new Date(2026, 8, 20, 8, 0).toISOString(),
  };
  const repost = blogPost('rep', { title: null, text: '', repostOf: source });

  it('у репоста крупно — оригинал, иначе в плитке серый квадрат', () => {
    expect(shownContent(repost)).toBe(source);
    const plain = blogPost('p');
    expect(shownContent(plain)).toBe(plain);
  });

  it('подпись плитки: заголовок, без него — начало текста, без текста — «Фотография»', () => {
    expect(blogTileTitle(blogPost('a', { title: 'Киртан в субботу' }))).toBe('Киртан в субботу');
    expect(blogTileTitle(blogPost('b', { title: null, text: 'Слова\n\nпоста' }))).toBe('Слова поста');
    expect(blogTileTitle(blogPost('c', { title: null, text: '' }))).toBe('Фотография');
    expect(blogTileTitle(repost)).toBe('Оригинал');
  });

  it('длинное начало текста обрезано многоточием', () => {
    const title = blogTileTitle(blogPost('d', { title: null, text: 'а '.repeat(100) }));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('в строке автора — отображаемое имя из ответа сервера, а не что-то своё', () => {
    const post = blogPost('a', { author: { id: 'u-9', name: 'Шьям дас', avatarUrl: null } });
    expect(blogMetaLine(post, now)).toBe('Шьям дас · 21 сентября, 09:05');
  });

  it('отметки правки, закрепления и «вне ленты» идут в ту же тихую строку', () => {
    const post = blogPost('a', {
      editedAt: new Date(2026, 8, 21, 14, 3).toISOString(),
      pinned: true,
      inFeed: false,
    });
    expect(blogDateLine(post, now)).toBe('21 сентября, 09:05 · изменено в 14:03 · закреплено · вне ленты');
    expect(blogMetaLine(post, now).startsWith('Маму Тхакур дас · ')).toBe(true);
  });

  it('над репостом — кто поделился, под заголовком — автор оригинала', () => {
    expect(blogRepostLabel(repost)).toBe('Репост · Маму Тхакур дас');
    expect(blogRepostLabel(blogPost('plain'))).toBeNull();
    expect(blogSourceMetaLine(repost, now)).toBe('Радха деви даси · 20 сентября, 08:00');
  });

  it('«Вся лента» говорит, сколько не поместилось', () => {
    expect(blogRestLabel(4, 4)).toBe('Вся лента');
    expect(blogRestLabel(5, 4)).toBe('Вся лента · ещё 1 пост');
    expect(blogRestLabel(7, 4)).toBe('Вся лента · ещё 3 поста');
    expect(blogRestLabel(16, 4)).toBe('Вся лента · ещё 12 постов');
    expect(blogRestLabel(2, 4)).toBe('Вся лента');
  });

  it('счётчик постов автора склоняется', () => {
    expect(blogAuthorCount(0)).toBe('Постов пока нет');
    expect(blogAuthorCount(1)).toBe('1 пост');
    expect(blogAuthorCount(22)).toBe('22 поста');
    expect(blogAuthorCount(11)).toBe('11 постов');
  });
});

describe('картинки', () => {
  it('рамка — по пропорции первого кадра, чтобы картинку было видно целиком', () => {
    expect(blogImageAspect([{ width: 1600, height: 1200 }])).toBeCloseTo(4 / 3);
  });

  it('слишком вытянутая и слишком широкая — в пределах 4:5 и 2:1', () => {
    expect(blogImageAspect([{ width: 1000, height: 3000 }])).toBe(BLOG_IMAGE_MIN_ASPECT);
    expect(blogImageAspect([{ width: 5000, height: 1000 }])).toBe(BLOG_IMAGE_MAX_ASPECT);
  });

  it('без размеров и без картинок — квадрат', () => {
    expect(blogImageAspect([{ width: null, height: null }])).toBe(1);
    expect(blogImageAspect([{ width: 0, height: 100 }])).toBe(1);
    expect(blogImageAspect([])).toBe(1);
  });

  it('счётчик кадров — только когда их больше одного', () => {
    expect(blogImageCounter(0, 1)).toBeNull();
    expect(blogImageCounter(0, 3)).toBe('1 из 3');
    expect(blogImageCounter(9, 3)).toBe('3 из 3');
  });

  it('номер кадра по прокрутке — в пределах карусели', () => {
    expect(blogImageIndex(0, 400, 3)).toBe(0);
    expect(blogImageIndex(410, 400, 3)).toBe(1);
    expect(blogImageIndex(5000, 400, 3)).toBe(2);
    expect(blogImageIndex(-50, 400, 3)).toBe(0);
    expect(blogImageIndex(100, 0, 3)).toBe(0);
  });
});
