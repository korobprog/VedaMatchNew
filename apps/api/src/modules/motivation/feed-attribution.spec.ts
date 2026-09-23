import {
  MAX_ATTRIBUTION_FILTER_LENGTH,
  attributionFilter,
  attributionKey,
  buildAttributionOptions,
  matchingVariants,
  splitWorkLocator,
  workKey,
} from './feed-attribution';

describe('attributionKey', () => {
  it('не различает регистр, пробелы и тире', () => {
    const key = attributionKey('Бхагавад-гита');
    expect(attributionKey('  бхагавад-гита ')).toBe(key);
    expect(attributionKey('БХАГАВАД–ГИТА')).toBe(key);
    expect(attributionKey('Бхагавад — гита')).toBe(key);
  });

  it('склеивает пробелы внутри и снимает точку в конце', () => {
    expect(attributionKey('Шрила   Прабхупада.')).toBe('шрила прабхупада');
  });

  it('ё и е — одно и то же, кавычки не считаются', () => {
    expect(attributionKey('«Учение Господа Чайтаньи»')).toBe(
      attributionKey('Учение Господа Чайтаньи'),
    );
    expect(attributionKey('Шри Ишопанишад, объяснённая')).toBe(
      attributionKey('шри ишопанишад, объясненная'),
    );
  });

  it('разные книги остаются разными', () => {
    expect(attributionKey('Бхагавад-гита')).not.toBe(
      attributionKey('Бхагавад-гита как она есть'),
    );
  });

  it('пустое — пустая строка', () => {
    expect(attributionKey(null)).toBe('');
    expect(attributionKey('  ')).toBe('');
  });
});

describe('attributionFilter', () => {
  it('без значения фильтра нет', () => {
    expect(attributionFilter(undefined)).toBeNull();
    expect(attributionFilter('')).toBeNull();
    expect(attributionFilter('   ')).toBeNull();
    expect(attributionFilter('...')).toBeNull();
  });

  it('слишком длинное значение отбрасывается', () => {
    expect(
      attributionFilter('а'.repeat(MAX_ATTRIBUTION_FILTER_LENGTH + 1)),
    ).toBeNull();
  });

  it('значение нормализуется', () => {
    expect(attributionFilter(' Бхагавад-Гита ')).toBe('бхагавад-гита');
  });

  it('массив из повторённого параметра не принимается', () => {
    expect(attributionFilter(['a', 'b'] as unknown as string)).toBeNull();
  });
});

describe('matchingVariants', () => {
  it('отбирает все написания одной книги', () => {
    expect(
      matchingVariants(
        ['Бхагавад-гита', 'бхагавад-гита ', null, 'Шримад-Бхагаватам'],
        'бхагавад-гита',
      ),
    ).toEqual(['Бхагавад-гита', 'бхагавад-гита ']);
  });

  it('ничего не подошло — пустой список', () => {
    expect(matchingVariants(['Гита'], 'веды')).toEqual([]);
  });
});

describe('buildAttributionOptions', () => {
  it('склеивает варианты, складывает счётчики и берёт частое написание', () => {
    expect(
      buildAttributionOptions([
        { value: 'бхагавад-гита', count: 2 },
        { value: 'Бхагавад-гита', count: 5 },
        { value: 'Шримад-Бхагаватам', count: 3 },
        { value: 'Бхагавад–гита ', count: 1 },
      ]),
    ).toEqual([
      { label: 'Бхагавад-гита', count: 8 },
      { label: 'Шримад-Бхагаватам', count: 3 },
    ]);
  });

  it('пустые значения и нули не попадают в список', () => {
    expect(
      buildAttributionOptions([
        { value: null, count: 10 },
        { value: '  ', count: 4 },
        { value: 'Веды', count: 0 },
      ]),
    ).toEqual([]);
  });

  it('при равных счётчиках — по алфавиту', () => {
    expect(
      buildAttributionOptions([
        { value: 'Упанишады', count: 1 },
        { value: 'Веданта-сутра', count: 1 },
      ]).map((option) => option.label),
    ).toEqual(['Веданта-сутра', 'Упанишады']);
  });

  it('подпись при равенстве вариантов стабильна', () => {
    const a = buildAttributionOptions([
      { value: 'гита', count: 1 },
      { value: 'Гита', count: 1 },
    ]);
    const b = buildAttributionOptions([
      { value: 'Гита', count: 1 },
      { value: 'гита', count: 1 },
    ]);
    expect(a).toEqual(b);
  });

  it('пробелы внутри подписи схлопываются', () => {
    expect(
      buildAttributionOptions([{ value: 'Шрила  Прабхупада', count: 1 }]),
    ).toEqual([{ label: 'Шрила Прабхупада', count: 1 }]);
  });
});

describe('splitWorkLocator (номер стиха записан в источник)', () => {
  it.each([
    ['Бхагавад-гита 2.11', 'Бхагавад-гита', '2.11'],
    ['Бхагавад-гита БГ 2.23', 'Бхагавад-гита', '2.23'],
    ['Шримад-Бхагаватам 1.2.12', 'Шримад-Бхагаватам', '1.2.12'],
    ['Бхагавад-гита 2.42-43', 'Бхагавад-гита', '2.42-43'],
    ['Бхагавад-гита, 6.1.', 'Бхагавад-гита', '6.1'],
    ['Бхагавад-гита глава 2.14', 'Бхагавад-гита', '2.14'],
    // VED-389: двоеточие и номер словами тоже встречаются в ручных записях.
    ['Бхагавад-гита 2:62', 'Бхагавад-гита', '2.62'],
    ['Бхагавад-гита, глава 2, стих 62', 'Бхагавад-гита', '2.62'],
    ['Бхагавад-гита гл. 2 текст 62-63', 'Бхагавад-гита', '2.62-63'],
  ])('%s → %s + %s', (value, work, locator) => {
    expect(splitWorkLocator(value)).toEqual({ work, locator });
  });

  it.each([
    'Бхагавад-гита',
    'Псалом 23',
    'Шри Ишопанишад',
    '2.11',
    '',
    'Глава 2',
  ])('%s — без номера', (value) => {
    expect(splitWorkLocator(value).locator).toBeNull();
  });

  it('ключ источника не видит номер стиха', () => {
    expect(workKey('Бхагавад-гита 2.11')).toBe(workKey('бхагавад-гита'));
    expect(workKey('Бхагавад-гита БГ 2.23')).toBe(workKey('Бхагавад-гита'));
    expect(workKey('Бхагавад-гита как она есть')).not.toBe(
      workKey('Бхагавад-гита'),
    );
  });

  it('фильтр по «Бхагавад-гита 2.11» ищет всю книгу', () => {
    expect(attributionFilter('Бхагавад-гита 2.11', workKey)).toBe(
      'бхагавад-гита',
    );
    expect(
      matchingVariants(
        ['Бхагавад-гита 2.11', 'Бхагавад-гита', 'Шри Ишопанишад'],
        'бхагавад-гита',
        workKey,
      ),
    ).toEqual(['Бхагавад-гита 2.11', 'Бхагавад-гита']);
  });

  it('список источников склеивает стихи одной книги', () => {
    expect(
      buildAttributionOptions(
        [
          { value: 'Бхагавад-гита 2.11', count: 1 },
          { value: 'Бхагавад-гита 2.12', count: 1 },
          { value: 'Бхагавад-гита БГ 2.23', count: 1 },
          { value: 'Путь к совершенству.', count: 3 },
        ],
        (value) => splitWorkLocator(value).work,
      ),
    ).toEqual([
      { label: 'Бхагавад-гита', count: 3 },
      { label: 'Путь к совершенству.', count: 3 },
    ]);
  });
});
