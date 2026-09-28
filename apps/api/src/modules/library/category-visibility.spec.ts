import { hiddenCategoryIds } from './category-visibility';

const rows = [
  { id: 'acharyas', path: '', lineage: null },
  { id: 'prabhupada', path: '.acharyas.', lineage: 'iskcon' },
  { id: 'sridhar', path: '.acharyas.', lineage: 'sri_chaitanya_saraswat_math' },
  { id: 'sridhar-talks', path: '.acharyas.sridhar.', lineage: null },
  { id: 'rupa', path: '.acharyas.', lineage: null },
];

describe('hiddenCategoryIds (VED-621)', () => {
  it('без фильтра линий никого не прячет', () => {
    expect(hiddenCategoryIds(rows, null).size).toBe(0);
    expect(hiddenCategoryIds(rows, []).size).toBe(0);
  });

  it('прячет автора чужой линии вместе с его подрубриками', () => {
    expect([...hiddenCategoryIds(rows, ['iskcon'])].sort()).toEqual([
      'sridhar',
      'sridhar-talks',
    ]);
  });

  it('рубрика без линии видна всем', () => {
    const hidden = hiddenCategoryIds(rows, ['sri_chaitanya_saraswat_math']);
    expect(hidden.has('rupa')).toBe(false);
    expect(hidden.has('acharyas')).toBe(false);
    expect(hidden.has('prabhupada')).toBe(true);
  });

  it('несколько линий — видны авторы любой из них', () => {
    expect(
      hiddenCategoryIds(rows, ['iskcon', 'sri_chaitanya_saraswat_math']).size,
    ).toBe(0);
  });
});
