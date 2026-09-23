import {
  findChapterConflict,
  normalizeChapterIds,
} from './music-audiobook-chapters';

describe('normalizeChapterIds', () => {
  it('не массив — отказ', () => {
    expect(normalizeChapterIds('a,b')).toBeNull();
    expect(normalizeChapterIds(undefined)).toBeNull();
  });

  it('не строка внутри — отказ, а не молчаливый пропуск', () => {
    expect(normalizeChapterIds(['a', 5])).toBeNull();
  });

  it('повтор оставляет первое место, пустые строки выпадают', () => {
    expect(normalizeChapterIds([' a ', 'b', '', 'a', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('пустой список — законный состав: книга без глав', () => {
    expect(normalizeChapterIds([])).toEqual([]);
  });
});

describe('findChapterConflict', () => {
  const owners = [
    { trackId: 't1', audiobookId: 'book-a', audiobookTitle: 'Гита' },
    { trackId: 't2', audiobookId: 'book-b', audiobookTitle: 'Бхагаватам' },
  ];

  it('свои главы конфликтом не считаются', () => {
    expect(findChapterConflict(['t1', 't3'], 'book-a', owners)).toBeNull();
  });

  it('глава чужой книги — отказ с названием той книги', () => {
    expect(findChapterConflict(['t1', 't2'], 'book-a', owners)).toEqual(
      owners[1],
    );
  });
});
