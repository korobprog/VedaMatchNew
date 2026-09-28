import {
  CATEGORY_PAGE_TITLE_MAX_LENGTH,
  pickCategoryPageTitle,
} from './category-page-title';

const TITLES = { titleRu: 'Е. С. Бхактивигьяна Г. М.', titleEn: null };

describe('pickCategoryPageTitle (VED-394)', () => {
  it('takes only the languages that came in the body', () => {
    expect(pickCategoryPageTitle({ titleRu: 'x' }, TITLES)).toEqual({});
    expect(
      pickCategoryPageTitle(
        { pageTitleRu: '  Бхактивигьяна  Госвами ' },
        TITLES,
      ),
    ).toEqual({ pageTitleRu: 'Бхактивигьяна Госвами' });
  });

  it('stores null when the heading is empty or equals the name', () => {
    expect(
      pickCategoryPageTitle({ pageTitleRu: '   ', pageTitleEn: null }, TITLES),
    ).toEqual({ pageTitleRu: null, pageTitleEn: null });
    expect(
      pickCategoryPageTitle(
        { pageTitleRu: 'Е. С. Бхактивигьяна Г. М.' },
        TITLES,
      ),
    ).toEqual({ pageTitleRu: null });
  });

  it('rejects non-strings and overlong headings', () => {
    expect(pickCategoryPageTitle({ pageTitleRu: 5 }, TITLES)).toBe(
      'page_title_invalid',
    );
    expect(
      pickCategoryPageTitle(
        { pageTitleEn: 'a'.repeat(CATEGORY_PAGE_TITLE_MAX_LENGTH + 1) },
        TITLES,
      ),
    ).toBe('page_title_too_long');
  });
});
