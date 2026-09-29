import { resolveUnionGenderFilter } from './union-gender-default';

/* VED-652: по умолчанию — противоположный пол. */
describe('resolveUnionGenderFilter', () => {
  it('без выбора — противоположный полу смотрящего', () => {
    expect(resolveUnionGenderFilter(undefined, 'male', false)).toBe('female');
    expect(resolveUnionGenderFilter('', 'female', false)).toBe('male');
  });

  it('явный выбор побеждает умолчание', () => {
    expect(resolveUnionGenderFilter('male', 'male', false)).toBe('male');
    expect(resolveUnionGenderFilter('female', 'female', true)).toBe('female');
  });

  it('«Показать всех» и режим showAll — без отбора по полу', () => {
    expect(resolveUnionGenderFilter('all', 'male', false)).toBeUndefined();
    expect(resolveUnionGenderFilter(undefined, 'male', true)).toBeUndefined();
  });

  it('пол смотрящего не указан — без отбора', () => {
    expect(resolveUnionGenderFilter(undefined, null, false)).toBeUndefined();
  });
});
