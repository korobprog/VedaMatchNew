import { BLOG_POST_TITLE_MAX_LENGTH } from '@vedamatch/shared';
import { buildBlogLinkPost, safeLinkUrl } from './blog-link-post';

describe('safeLinkUrl', () => {
  it('пропускает путь портала и https', () => {
    expect(safeLinkUrl('/library/entry/1')).toBe('/library/entry/1');
    expect(safeLinkUrl('https://media.example/a.png')).toBe(
      'https://media.example/a.png',
    );
  });

  it('отвергает прочие схемы и адреса без схемы', () => {
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeLinkUrl('http://example.com')).toBeNull();
    expect(safeLinkUrl('//evil.com/x')).toBeNull();
    expect(safeLinkUrl('  ')).toBeNull();
    expect(safeLinkUrl(null)).toBeNull();
  });
});

describe('buildBlogLinkPost', () => {
  const base = {
    title: ' Настоящая проповедь ',
    text: 'Описание\r\n\r\n\r\nмасштабное',
    url: '/library/entry/42',
    imageUrl: 'https://media.example/cover.webp',
    label: 'Образование',
  };

  it('собирает пост со ссылкой', () => {
    expect(buildBlogLinkPost(base)).toEqual({
      title: 'Настоящая проповедь',
      text: 'Описание\n\nмасштабное',
      linkUrl: '/library/entry/42',
      linkLabel: 'Образование',
      linkImageUrl: 'https://media.example/cover.webp',
    });
  });

  it('подрезает длинный заголовок, а не отвергает его', () => {
    const post = buildBlogLinkPost({ ...base, title: 'а'.repeat(300) });
    expect(post?.title).toHaveLength(BLOG_POST_TITLE_MAX_LENGTH);
    expect(post?.title?.endsWith('…')).toBe(true);
  });

  it('без годной ссылки поста нет, негодная обложка просто пропадает', () => {
    expect(buildBlogLinkPost({ ...base, url: 'javascript:x' })).toBeNull();
    expect(
      buildBlogLinkPost({ ...base, imageUrl: 'data:image/png;base64,AA' })
        ?.linkImageUrl,
    ).toBeNull();
  });
});
