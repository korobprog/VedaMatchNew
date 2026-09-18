import { mergeCategoryCounts } from './music-category-counts';

describe('mergeCategoryCounts', () => {
  it('пустые источники — пустая карта', () => {
    expect(mergeCategoryCounts([], [])).toEqual(new Map());
  });

  it('только стиль — карта по categoryId стиля', () => {
    const result = mergeCategoryCounts(
      [
        { categoryId: 'kirtan', count: 5 },
        { categoryId: 'mantra', count: 2 },
      ],
      [],
    );
    expect(result.get('kirtan')).toBe(5);
    expect(result.get('mantra')).toBe(2);
    expect(result.size).toBe(2);
  });

  it('только корневая — карта по rootCategoryId, суммируя исполнителей', () => {
    // Два исполнителя с одной и той же корневой — их записи складываются.
    const result = mergeCategoryCounts(
      [],
      [
        { rootCategoryId: 'traditional', trackCount: 12 },
        { rootCategoryId: 'traditional', trackCount: 3 },
        { rootCategoryId: 'modern', trackCount: 7 },
      ],
    );
    expect(result.get('traditional')).toBe(15);
    expect(result.get('modern')).toBe(7);
  });

  it('стиль и корневая одновременно — множества id не пересекаются', () => {
    const result = mergeCategoryCounts(
      [{ categoryId: 'kirtan', count: 4 }],
      [{ rootCategoryId: 'traditional', trackCount: 9 }],
    );
    expect(result.get('kirtan')).toBe(4);
    expect(result.get('traditional')).toBe(9);
    expect(result.size).toBe(2);
  });
});
