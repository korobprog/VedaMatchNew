import { READER_VISIBLE_POSTS } from './reader-visible';

describe('READER_VISIBLE_POSTS', () => {
  it('берёт только опубликованное', () => {
    expect(READER_VISIBLE_POSTS.status).toBe('published');
  });

  // Условия внутри NOT читаются как «не (участник И источник не сверен И
  // автор не администратор И это не готовая картинка)»: афоризм
  // администратора (VED-9) и готовая картинка участника (VED-97) видимы.
  it('отсекает рилс участника без проверенного источника, кроме админского и готовой картинки', () => {
    expect(READER_VISIBLE_POSTS.NOT).toEqual({
      origin: 'user',
      sourceVerified: false,
      authorIsAdmin: false,
      captionInImage: false,
    });
  });

  it('не смотрит на направления читателя: число не должно зависеть от галочек', () => {
    expect(Object.keys(READER_VISIBLE_POSTS).sort()).toEqual(['NOT', 'status']);
  });
});
