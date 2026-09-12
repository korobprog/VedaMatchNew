import { READER_VISIBLE_POSTS } from './reader-visible';

describe('READER_VISIBLE_POSTS', () => {
  it('берёт только опубликованное', () => {
    expect(READER_VISIBLE_POSTS.status).toBe('published');
  });

  // Три условия внутри NOT читаются как «не (участник И источник не сверен И
  // автор не администратор)»: афоризм администратора остаётся видимым (VED-9).
  it('отсекает рилс участника без проверенного источника, кроме админского', () => {
    expect(READER_VISIBLE_POSTS.NOT).toEqual({
      origin: 'user',
      sourceVerified: false,
      authorIsAdmin: false,
    });
  });

  it('не смотрит на направления читателя: число не должно зависеть от галочек', () => {
    expect(Object.keys(READER_VISIBLE_POSTS).sort()).toEqual(['NOT', 'status']);
  });
});
