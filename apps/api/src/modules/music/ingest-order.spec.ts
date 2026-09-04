import { sortIngestEntries } from './ingest-order';

describe('sortIngestEntries', () => {
  it('номер из тегов важнее имени файла', () => {
    const sorted = sortIngestEntries([
      { ref: 'b.mp3', trackNumber: 1 },
      { ref: 'a.mp3', trackNumber: 2 },
    ]);
    expect(sorted).toEqual(['b.mp3', 'a.mp3']);
  });

  it('без тегов сортирует имена по-человечески: 2 перед 10', () => {
    const sorted = sortIngestEntries([
      { ref: 'track10.mp3', trackNumber: null },
      { ref: 'track2.mp3', trackNumber: null },
    ]);
    expect(sorted).toEqual(['track2.mp3', 'track10.mp3']);
  });

  it('часть с тегами, часть без: с тегами идут первыми, остальные по имени', () => {
    const sorted = sortIngestEntries([
      { ref: 'zzz.mp3', trackNumber: null },
      { ref: 'aaa.mp3', trackNumber: 3 },
    ]);
    expect(sorted).toEqual(['aaa.mp3', 'zzz.mp3']);
  });

  it('одинаковые номера разводит по имени, а не оставляет на волю сортировки', () => {
    const sorted = sortIngestEntries([
      { ref: 'b.mp3', trackNumber: 1 },
      { ref: 'a.mp3', trackNumber: 1 },
    ]);
    expect(sorted).toEqual(['a.mp3', 'b.mp3']);
  });
});

// Ниже — случаи сверх плана.
describe('sortIngestEntries: устойчивость порядка', () => {
  it('не трогает переданный массив', () => {
    const entries = [
      { ref: 'b.mp3', trackNumber: 2 },
      { ref: 'a.mp3', trackNumber: 1 },
    ];
    sortIngestEntries(entries);
    expect(entries.map((entry) => entry.ref)).toEqual(['b.mp3', 'a.mp3']);
  });

  it('нулевой номер тегом не считает', () => {
    // Многие теггеры пишут 0 вместо пустого поля.
    const sorted = sortIngestEntries([
      { ref: 'b.mp3', trackNumber: 0 },
      { ref: 'a.mp3', trackNumber: 5 },
    ]);
    expect(sorted).toEqual(['a.mp3', 'b.mp3']);
  });

  it('сравнивает кириллицу как человек, а не по кодам', () => {
    const sorted = sortIngestEntries([
      { ref: 'Ямуна 10.mp3', trackNumber: null },
      { ref: 'Ямуна 2.mp3', trackNumber: null },
      { ref: 'Ганга 1.mp3', trackNumber: null },
    ]);
    expect(sorted).toEqual(['Ганга 1.mp3', 'Ямуна 2.mp3', 'Ямуна 10.mp3']);
  });

  it('пустой список не ломает', () => {
    expect(sortIngestEntries([])).toEqual([]);
  });
});
