import { buildBlogPostCopy, blogPostLink } from './blog-copy';
import { blogPost } from './blog-fixtures';

describe('buildBlogPostCopy', () => {
  it('автор, заголовок, текст и ссылка последней строкой', () => {
    const post = blogPost('p1', { title: 'Киртан', text: 'Приходите в субботу' });
    expect(buildBlogPostCopy(post, 'https://vedamatch.ru/')).toBe(
      'Маму Тхакур дас\nКиртан\nПриходите в субботу\n\nhttps://vedamatch.ru/blog?post=p1',
    );
  });

  it('у репоста первым идёт оригинал, свои слова — под ним', () => {
    const post = blogPost('r1', {
      title: null,
      text: 'Смотрите',
      repostOf: {
        id: 's1',
        author: { id: 'u2', name: 'Радха деви даси', avatarUrl: null },
        title: 'Оригинал',
        text: 'Слова',
        images: [],
        media: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(buildBlogPostCopy(post)).toBe('Радха деви даси\nОригинал\nСлова\n\nрепост: Маму Тхакур дас\nСмотрите');
  });

  it('картиночный пост без слов — копировать нечего, пустых строк нет', () => {
    expect(buildBlogPostCopy(blogPost('p', { title: null, text: '' }), 'https://vedamatch.ru')).toBe(
      'https://vedamatch.ru/blog?post=p',
    );
  });

  it('без адреса портала ссылки нет', () => {
    expect(blogPostLink('p', null)).toBeNull();
    expect(blogPostLink('p', '  ')).toBeNull();
    expect(blogPostLink('a b', 'https://x.ru')).toBe('https://x.ru/blog?post=a%20b');
  });
});
