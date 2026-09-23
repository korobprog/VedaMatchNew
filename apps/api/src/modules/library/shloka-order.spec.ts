import {
  compareVerses,
  neighborsOf,
  sortByVerse,
  verseKey,
} from './shloka-order';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 24, 10, minute));

function shloka(id: string, verse: string | null, minute = 0) {
  return { id, verse, publishedAt: at(minute) };
}

describe('compareVerses', () => {
  it('сравнивает номера по числам, а не строкой', () => {
    const verses = ['10.8', '2.13', '2.2', '1.10', '1.2', '2.14'];
    expect([...verses].sort(compareVerses)).toEqual([
      '1.2',
      '1.10',
      '2.2',
      '2.13',
      '2.14',
      '10.8',
    ]);
  });

  it('ставит трёхчастные номера Бхагаватам по порядку песни, главы и стиха', () => {
    expect(
      ['1.2.12', '1.10.1', '1.2.6', '10.1.1', '1.1.1'].sort(compareVerses),
    ).toEqual(['1.1.1', '1.2.6', '1.2.12', '1.10.1', '10.1.1']);
  });

  it('одиночный стих — раньше диапазона, диапазон — по его концу', () => {
    expect(['2.62-63', '2.62', '2.63', '2.62–64'].sort(compareVerses)).toEqual([
      '2.62',
      '2.62-63',
      '2.62–64',
      '2.63',
    ]);
  });

  it('глава целиком раньше её первого стиха', () => {
    expect(compareVerses('2', '2.1')).toBeLessThan(0);
  });

  it('части Чайтанья-чаритамриты — в порядке книги', () => {
    expect(
      ['Антья 1.1', 'Мадхья 20.108', 'Ади 7.5', 'Madhya 1.1'].sort(
        compareVerses,
      ),
    ).toEqual(['Ади 7.5', 'Madhya 1.1', 'Мадхья 20.108', 'Антья 1.1']);
  });

  it('без номера и без цифр — в конце, пустой — самым последним', () => {
    expect(['', 'Предисловие', '1.1', null].sort(compareVerses)).toEqual([
      '1.1',
      'Предисловие',
      '',
      null,
    ]);
  });

  it('слова «глава» и «стих» в порядке не участвуют', () => {
    expect(compareVerses('Глава 2, стих 13', '2.14')).toBeLessThan(0);
    expect(verseKey('Глава 2, стих 13').numbers).toEqual([2, 13]);
  });
});

describe('sortByVerse', () => {
  it('равные номера — по времени добавления, затем по id', () => {
    const sorted = sortByVerse([
      shloka('c', '1.1', 5),
      shloka('b', '1.1', 1),
      shloka('a', '1.1', 1),
      shloka('d', '1.0', 9),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('не меняет исходный массив', () => {
    const input = [shloka('b', '2.1'), shloka('a', '1.1')];
    sortByVerse(input);
    expect(input.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('neighborsOf', () => {
  const ordered = [shloka('a', '1.1'), shloka('b', '1.2'), shloka('c', '1.3')];

  it('даёт соседей и место в источнике', () => {
    expect(neighborsOf(ordered, 'b')).toEqual({
      prev: ordered[0],
      next: ordered[2],
      position: 2,
      total: 3,
    });
  });

  it('у первой нет «назад», у последней — «вперёд»', () => {
    expect(neighborsOf(ordered, 'a').prev).toBeNull();
    expect(neighborsOf(ordered, 'c').next).toBeNull();
  });

  it('шлоки нет в ряду — места нет, стрелок нет', () => {
    expect(neighborsOf(ordered, 'z')).toEqual({
      prev: null,
      next: null,
      position: 0,
      total: 3,
    });
  });
});
