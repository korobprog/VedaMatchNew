import { READER_VISIBLE_POSTS } from './reader-visible';

describe('READER_VISIBLE_POSTS', () => {
  it('берёт только опубликованное', () => {
    expect(READER_VISIBLE_POSTS.status).toBe('published');
  });

  it('отсекает рилс участника без проверенного источника', () => {
    expect(READER_VISIBLE_POSTS.NOT).toEqual({
      origin: 'user',
      sourceVerified: false,
    });
  });

  it('не смотрит на направления читателя: число не должно зависеть от галочек', () => {
    expect(Object.keys(READER_VISIBLE_POSTS).sort()).toEqual(['NOT', 'status']);
  });
});
