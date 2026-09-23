import {
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_TEXT_MAX_LENGTH,
  BLOG_POST_TITLE_MAX_LENGTH,
} from '@vedamatch/shared';
import {
  normalizeText,
  normalizeTitle,
  validateBlogPost,
} from './blog-validate';

describe('validateBlogPost', () => {
  it('accepts a plain text post', () => {
    expect(
      validateBlogPost({ title: null, text: 'Харе Кришна', imageCount: 0 }),
    ).toBeNull();
  });

  // Лента картиночная: снимок без единого слова — законный пост.
  it('accepts a post that is only a picture', () => {
    expect(
      validateBlogPost({ title: null, text: '   ', imageCount: 1 }),
    ).toBeNull();
  });

  it('rejects a post with nothing in it', () => {
    expect(validateBlogPost({ title: '  ', text: '\n\n', imageCount: 0 })).toBe(
      'post_empty',
    );
  });

  // У репоста содержание есть — чужой пост под своим.
  it('accepts an empty repost', () => {
    expect(
      validateBlogPost({
        title: null,
        text: '',
        imageCount: 0,
        isRepost: true,
      }),
    ).toBeNull();
  });

  it('rejects an over-long title', () => {
    expect(
      validateBlogPost({
        title: 'я'.repeat(BLOG_POST_TITLE_MAX_LENGTH + 1),
        text: '',
        imageCount: 0,
      }),
    ).toBe('title_too_long');
  });

  it('accepts a title exactly at the limit', () => {
    expect(
      validateBlogPost({
        title: 'я'.repeat(BLOG_POST_TITLE_MAX_LENGTH),
        text: '',
        imageCount: 0,
      }),
    ).toBeNull();
  });

  it('rejects an over-long text', () => {
    expect(
      validateBlogPost({
        title: null,
        text: 'я'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 1),
        imageCount: 0,
      }),
    ).toBe('text_too_long');
  });

  it('rejects too many images', () => {
    expect(
      validateBlogPost({
        title: null,
        text: 'текст',
        imageCount: BLOG_POST_MAX_IMAGES + 1,
      }),
    ).toBe('too_many_images');
  });

  // Порядок проверок — порядок полей формы, чтобы подсветка ошибки не
  // прыгала снизу вверх.
  it('reports the first broken rule in form order', () => {
    expect(
      validateBlogPost({
        title: 'я'.repeat(BLOG_POST_TITLE_MAX_LENGTH + 1),
        text: 'я'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 1),
        imageCount: BLOG_POST_MAX_IMAGES + 1,
      }),
    ).toBe('title_too_long');
  });
});

describe('normalizeTitle', () => {
  it('trims the title', () => {
    expect(normalizeTitle('  Праздник  ')).toBe('Праздник');
  });

  it('turns blank into "no title"', () => {
    expect(normalizeTitle('   ')).toBeNull();
    expect(normalizeTitle('')).toBeNull();
    expect(normalizeTitle(undefined)).toBeNull();
    expect(normalizeTitle(42)).toBeNull();
  });
});

describe('normalizeText', () => {
  it('keeps paragraphs alive', () => {
    expect(normalizeText('первый\n\nвторой')).toBe('первый\n\nвторой');
  });

  it('normalizes windows line endings', () => {
    expect(normalizeText('первый\r\nвторой')).toBe('первый\nвторой');
  });

  // Иначе постом в ленту уезжает экран пустоты.
  it('collapses a run of blank lines', () => {
    expect(normalizeText('первый\n\n\n\n\nвторой')).toBe('первый\n\nвторой');
  });

  // VED-372: вставка из мессенджера приносит строки из пробелов, и до этой
  // правки схлопывание их не замечало — в ленте оставалась дыра.
  it('sees a line of spaces and tabs as blank', () => {
    expect(normalizeText('первый\n \n\t\n  \nвторой')).toBe('первый\n\nвторой');
    expect(normalizeText('первый\n   \nвторой')).toBe('первый\n\nвторой');
  });

  // Отступ в начале строки со словами — часть текста, а не пустота.
  it('keeps the indentation of a line that has words', () => {
    expect(normalizeText('первый\n    второй')).toBe('первый\n    второй');
  });

  it('trims the edges and survives garbage', () => {
    expect(normalizeText('  текст  ')).toBe('текст');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(7)).toBe('');
  });
});
