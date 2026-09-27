import {
  CATEGORY_INFO_MAX_LENGTH,
  isCategoryInfoRejection,
  normalizeCategoryInfo,
  pickCategoryInfo,
} from './category-info';

describe('normalizeCategoryInfo', () => {
  it('turns an empty or blank section into null', () => {
    expect(normalizeCategoryInfo('')).toBeNull();
    expect(normalizeCategoryInfo('   \n\t ')).toBeNull();
    expect(normalizeCategoryInfo(null)).toBeNull();
    expect(normalizeCategoryInfo(undefined)).toBeNull();
  });

  it('keeps line breaks, unifying them to \\n', () => {
    expect(normalizeCategoryInfo('  Пн 19:00\r\nСр 19:00\rПт  ')).toBe(
      'Пн 19:00\nСр 19:00\nПт',
    );
  });

  it('stores plain text: strips tags but not lone angle brackets', () => {
    expect(
      normalizeCategoryInfo('<b>Тел.</b> <a href="x">+7 900</a><br/>a < b <3'),
    ).toBe('Тел. +7 900a < b <3');
    expect(normalizeCategoryInfo('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('drops control characters and collapses runs of blank lines', () => {
    expect(normalizeCategoryInfo('a\u0000b\n\n\n\n\nc')).toBe('ab\n\nc');
  });
});

describe('pickCategoryInfo', () => {
  it('takes only the sections that were sent', () => {
    expect(
      pickCategoryInfo({
        titleRu: 'x',
        infoBio: ' Родился ',
        infoSchedule: '',
      }),
    ).toEqual({ infoBio: 'Родился', infoSchedule: null });
    expect(pickCategoryInfo({ titleRu: 'x' })).toEqual({});
  });

  it('clears a section with null or an empty string', () => {
    expect(
      pickCategoryInfo({ infoContacts: null, infoResources: '  ' }),
    ).toEqual({ infoContacts: null, infoResources: null });
  });

  it('allows exactly the limit and rejects one character more', () => {
    const atLimit = 'я'.repeat(CATEGORY_INFO_MAX_LENGTH);
    expect(pickCategoryInfo({ infoBio: atLimit })).toEqual({
      infoBio: atLimit,
    });
    expect(pickCategoryInfo({ infoBio: `${atLimit}я` })).toBe('info_too_long');
  });

  it('measures the limit after trimming', () => {
    const atLimit = 'я'.repeat(CATEGORY_INFO_MAX_LENGTH);
    expect(
      isCategoryInfoRejection(pickCategoryInfo({ infoBio: `  ${atLimit}\n` })),
    ).toBe(false);
  });

  it('rejects a non-string section', () => {
    expect(pickCategoryInfo({ infoContacts: 42 })).toBe('info_invalid');
    expect(pickCategoryInfo({ infoContacts: ['a'] })).toBe('info_invalid');
  });
});
