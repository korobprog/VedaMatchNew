import {
  mergeCategoryCounts,
  styleCountTrackFilter,
} from './music-category-counts';

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

// VED-165: чип стиля обязан обещать ровно то, что откроется по нажатию.
// Под корневой вкладкой выдача уже сужена, и счётчик, считающий по всему
// каталогу, показывает «Киртан 12» там, где записей две.
describe('styleCountTrackFilter', () => {
  it('витрина без вкладки — только опубликованное, без среза по корневой', () => {
    expect(styleCountTrackFilter(true, null)).toEqual({ status: 'published' });
  });

  it('справочник админки считает любые статусы', () => {
    expect(styleCountTrackFilter(false, null)).toEqual({});
  });

  it('под вкладкой сужает тем же условием, что и выдача — по исполнителю', () => {
    expect(styleCountTrackFilter(true, 'traditional')).toEqual({
      status: 'published',
      artist: { rootCategory: { slug: 'traditional' } },
    });
  });

  it('срез по корневой не зависит от статуса', () => {
    expect(styleCountTrackFilter(false, 'modern')).toEqual({
      artist: { rootCategory: { slug: 'modern' } },
    });
  });
});
