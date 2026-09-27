import {
  NO_SOURCE_KEY,
  groupBySource,
  shlokaFirstLine,
  shlokaSourceKey,
  sortFolder,
} from './shloka-source';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 27, 10, minute));

describe('shlokaSourceKey', () => {
  it('не смотрит на регистр, пробелы, «ё» и вид тире', () => {
    const keys = [
      'Бхагавад-гита',
      '  бхагавад-гита ',
      'БХАГАВАД–ГИТА',
      'Бхагавад - гита',
    ].map(shlokaSourceKey);
    expect(new Set(keys)).toEqual(new Set(['бхагавад-гита']));
    expect(shlokaSourceKey('Шримад  Бхагаватам')).toBe('шримад бхагаватам');
    expect(shlokaSourceKey('Чайтанья-чаритамрита, Мадхья-лила')).toBe(
      'чайтанья-чаритамрита, мадхья-лила',
    );
    expect(shlokaSourceKey('Песни Шрилы Прабхупады: «Ёга»')).toBe(
      'песни шрилы прабхупады: «ега»',
    );
  });

  it('пусто и строка без букв и цифр — без источника', () => {
    expect(shlokaSourceKey(null)).toBe(NO_SOURCE_KEY);
    expect(shlokaSourceKey('   ')).toBe(NO_SOURCE_KEY);
    expect(shlokaSourceKey('—')).toBe(NO_SOURCE_KEY);
    expect(shlokaSourceKey('_')).toBe(NO_SOURCE_KEY);
  });
});

describe('groupBySource', () => {
  it('складывает написания в одну папку с самой частой подписью', () => {
    const folders = groupBySource([
      { id: '1', source: 'бхагавад-гита', publishedAt: at(1) },
      { id: '2', source: 'Бхагавад-гита', publishedAt: at(2) },
      { id: '3', source: 'Бхагавад-гита ', publishedAt: at(3) },
      { id: '4', source: 'Шримад-Бхагаватам', publishedAt: at(4) },
      { id: '5', source: null, publishedAt: at(5) },
      { id: '6', source: 'Ишопанишад', publishedAt: at(6) },
    ]);
    expect(folders).toEqual([
      { key: 'бхагавад-гита', label: 'Бхагавад-гита', count: 3 },
      { key: 'ишопанишад', label: 'Ишопанишад', count: 1 },
      { key: 'шримад-бхагаватам', label: 'Шримад-Бхагаватам', count: 1 },
      { key: NO_SOURCE_KEY, label: null, count: 1 },
    ]);
  });

  it('при равенстве написаний подпись — самое раннее', () => {
    const [folder] = groupBySource([
      { id: '1', source: 'ИШОПАНИШАД', publishedAt: at(5) },
      { id: '2', source: 'Ишопанишад', publishedAt: at(1) },
    ]);
    expect(folder.label).toBe('Ишопанишад');
  });

  it('пустой список — без папок', () => {
    expect(groupBySource([])).toEqual([]);
  });
});

describe('sortFolder', () => {
  it('по номеру стиха, а без номера — по дате после пронумерованных', () => {
    const ordered = sortFolder([
      { id: 'late', verse: null, publishedAt: at(9) },
      { id: '10.1', verse: '10.1', publishedAt: at(1) },
      { id: 'intro', verse: 'Предисловие', publishedAt: at(2) },
      { id: '2.13', verse: '2.13', publishedAt: at(3) },
      { id: '1.7.7', verse: '1.7.7', publishedAt: at(4) },
      { id: '2.2', verse: '2.2', publishedAt: at(5) },
      { id: 'early', verse: null, publishedAt: at(0) },
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      '1.7.7',
      '2.2',
      '2.13',
      '10.1',
      'early',
      'intro',
      'late',
    ]);
  });

  it('возвращает исходные объекты с исходным номером', () => {
    const item = { id: 'a', verse: 'Предисловие', publishedAt: at(0), x: 1 };
    expect(sortFolder([item])[0]).toBe(item);
  });
});

describe('shlokaFirstLine', () => {
  it('первая непустая строка стиха', () => {
    expect(
      shlokaFirstLine('\n  dehino ’smin yathā dehe  \nkaumāraṁ', 'Как'),
    ).toEqual({ line: 'dehino ’smin yathā dehe', from: 'text' });
  });

  it('без оригинала — начало перевода одной строкой', () => {
    expect(shlokaFirstLine('', 'Как воплощённая\nдуша')).toEqual({
      line: 'Как воплощённая душа',
      from: 'translation',
    });
  });

  it('длинное обрезает многоточием', () => {
    const { line } = shlokaFirstLine('а'.repeat(400), null);
    expect(line).toHaveLength(160);
    expect(line.endsWith('…')).toBe(true);
  });
});
