import { announceBlogChange, applyBlogChange, resetBlogChanges, subscribeBlogChanges, type BlogChange } from './blog-changes';
import { blogPost } from './blog-fixtures';

afterEach(() => resetBlogChanges());

const ids = (posts: { id: string }[]) => posts.map((post) => post.id);

describe('изменения ленты между экранами', () => {
  it('подписчики получают изменение; отписавшийся — нет', () => {
    const first = jest.fn();
    const second = jest.fn();
    subscribeBlogChanges(first);
    const off = subscribeBlogChanges(second);
    off();
    const change: BlogChange = { kind: 'removed', id: 'p1' };
    announceBlogChange(change);
    expect(first).toHaveBeenCalledWith(change);
    expect(second).not.toHaveBeenCalled();
  });

  it('опубликованный пост встаёт в ленту сверху, под закреплёнными', () => {
    const list = [blogPost('pin', { pinned: true }), blogPost('a')];
    expect(ids(applyBlogChange(list, { kind: 'created', post: blogPost('new') }))).toEqual(['pin', 'new', 'a']);
  });

  it('удалённый пост уходит из списка', () => {
    expect(ids(applyBlogChange([blogPost('a'), blogPost('b')], { kind: 'removed', id: 'a' }))).toEqual(['b']);
  });

  it('репост: новая карточка сверху и +1 у оригинала', () => {
    const list = [blogPost('src', { repostCount: 1 })];
    const next = applyBlogChange(list, { kind: 'reposted', sourceId: 'src', post: blogPost('rep') });
    expect(ids(next)).toEqual(['rep', 'src']);
    expect(next[1].repostCount).toBe(2);
  });

  it('в блог автора чужой новый пост не попадает, а счётчик репостов растёт', () => {
    const author = 'u-1';
    const list = [blogPost('src', { repostCount: 0 })];
    const foreign = blogPost('rep', { author: { id: 'u-2', name: 'Другой', avatarUrl: null } });
    const next = applyBlogChange(list, { kind: 'reposted', sourceId: 'src', post: foreign }, author);
    expect(ids(next)).toEqual(['src']);
    expect(next[0].repostCount).toBe(1);
    expect(ids(applyBlogChange(list, { kind: 'created', post: blogPost('mine') }, author))).toEqual(['mine', 'src']);
  });
});
