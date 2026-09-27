import type { BlogMediaDto } from '@vedamatch/shared';
import { blogPost } from './blog-fixtures';
import { blogHomeTile, blogHomeTileLabel, blogPostMedia } from './blog-home-tile';

/**
 * Плитка полосы ленты — те же случаи, что у `blogHomeSlide` сайта
 * (`apps/web/src/components/blog/blog-media-list.spec.ts`), плюс то, из-за
 * чего перенос и делался: ролик и материал из Образования без `images`.
 */

function media(overrides: Partial<BlogMediaDto> = {}): BlogMediaDto {
  return {
    id: 'm1',
    url: 'https://cdn/p.webp',
    width: 800,
    height: 600,
    kind: 'photo',
    posterUrl: null,
    durationSec: null,
    ...overrides,
  };
}

describe('плитка ленты в «Чатах»: обложка', () => {
  it('фото — картинка и заголовок', () => {
    expect(blogHomeTile(blogPost('a', { title: 'Киртан', media: [media()] }))).toMatchObject({
      title: 'Киртан',
      coverUrl: 'https://cdn/p.webp',
      isVideo: false,
      mediaCount: 1,
    });
  });

  it('пост с одним роликом — обложка ролика и отметка «видео», а не слова в рамке', () => {
    const post = blogPost('v', {
      images: [],
      media: [media({ kind: 'video', url: 'https://cdn/v.mp4', posterUrl: 'https://cdn/v.webp' })],
    });
    expect(blogHomeTile(post)).toMatchObject({ coverUrl: 'https://cdn/v.webp', isVideo: true, frameText: '' });
  });

  it('материал из Образования (VED-490) — обложка материала', () => {
    const post = blogPost('l', {
      title: 'Бхагавад-гита, глава 2',
      link: { url: '/library/entry/e1', label: 'Образование', imageUrl: 'https://cdn/cover.webp' },
    });
    expect(blogHomeTile(post)).toMatchObject({ coverUrl: 'https://cdn/cover.webp', title: 'Бхагавад-гита, глава 2' });
  });

  it('вложение важнее обложки материала', () => {
    const post = blogPost('lm', {
      media: [media()],
      link: { url: '/library/entry/e1', label: 'Образование', imageUrl: 'https://cdn/cover.webp' },
    });
    expect(blogHomeTile(post).coverUrl).toBe('https://cdn/p.webp');
  });

  it('у репоста — оригинал', () => {
    const source = {
      id: 'src',
      author: { id: 'u-2', name: 'Радха деви даси', avatarUrl: null },
      title: 'Оригинал',
      text: 'Слова оригинала',
      images: [],
      media: [media({ kind: 'video', posterUrl: 'https://cdn/src.webp' })],
      createdAt: new Date(2026, 8, 20).toISOString(),
    };
    const tile = blogHomeTile(blogPost('r', { title: null, text: '', repostOf: source }));
    expect(tile).toMatchObject({ id: 'r', title: 'Оригинал', coverUrl: 'https://cdn/src.webp', isVideo: true });
  });

  it('текст со внешней ссылкой, без медиа и без материала — по-прежнему словами, как на сайте', () => {
    const tile = blogHomeTile(blogPost('t', { title: null, text: 'Читайте https://example.org', link: null }));
    expect(tile).toMatchObject({ coverUrl: null, frameText: 'Читайте https://example.org', title: null });
  });

  it('старый ответ без `media` — обложка из фотографий', () => {
    const post = blogPost('o', { images: [{ id: 'i', url: 'https://cdn/old.jpg', width: 1, height: 1 }] });
    delete (post as { media?: unknown }).media;
    expect(blogPostMedia(post)).toHaveLength(1);
    expect(blogHomeTile(post).coverUrl).toBe('https://cdn/old.jpg');
  });
});

describe('плитка ленты в «Чатах»: подпись', () => {
  it('пост из одних слов — слова в рамке, одно и то же дважды не пишется', () => {
    expect(blogHomeTile(blogPost('a', { title: null, text: 'Только слова' }))).toMatchObject({
      coverUrl: null,
      frameText: 'Только слова',
      title: null,
    });
    expect(blogHomeTile(blogPost('b', { title: 'Тема', text: 'Слова' }))).toMatchObject({ frameText: 'Слова', title: 'Тема' });
    expect(blogHomeTile(blogPost('c', { title: 'Тема', text: '' }))).toMatchObject({ frameText: 'Тема', title: null });
  });

  it('фото без заголовка — подпись из начала текста, обрезанная многоточием', () => {
    const tile = blogHomeTile(blogPost('d', { title: null, text: 'а'.repeat(200), media: [media()] }));
    expect(tile.title?.endsWith('…')).toBe(true);
    expect(tile.title!.length).toBeLessThanOrEqual(81);
  });

  it('фото без заголовка и без слов — подписи нет', () => {
    expect(blogHomeTile(blogPost('e', { title: null, text: '', media: [media()] })).title).toBeNull();
  });
});

describe('плитка ленты в «Чатах»: имя для скринридера', () => {
  it('заголовок, автор и действие', () => {
    const tile = blogHomeTile(blogPost('a', { title: 'Киртан', media: [media()] }));
    expect(blogHomeTileLabel(tile, 'Маму Тхакур дас')).toBe('Киртан. Маму Тхакур дас. Открыть пост');
  });

  it('ролик называется роликом', () => {
    const titled = blogHomeTile(blogPost('v', { title: 'Киртан', media: [media({ kind: 'video', posterUrl: 'p' })] }));
    expect(blogHomeTileLabel(titled, 'А')).toBe('Киртан, ролик. А. Открыть пост');
    const bare = blogHomeTile(blogPost('w', { title: null, text: '', media: [media({ kind: 'video', posterUrl: 'p' })] }));
    expect(blogHomeTileLabel(bare, 'А')).toBe('Пост с роликом. А. Открыть пост');
  });

  it('фото без слов — не пустая ссылка', () => {
    const tile = blogHomeTile(blogPost('p', { title: null, text: '', media: [media()] }));
    expect(blogHomeTileLabel(tile, 'А')).toBe('Пост с фотографией. А. Открыть пост');
  });
});
