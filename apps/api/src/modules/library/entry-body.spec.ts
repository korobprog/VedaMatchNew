import { entryLocatorError, normalizeEntryBody } from './entry-body';

describe('normalizeEntryBody', () => {
  it('приводит переводы строк Windows и старого Mac к одному виду', () => {
    expect(normalizeEntryBody('Первая\r\nвторая\rтретья')).toBe(
      'Первая\nвторая\nтретья',
    );
  });

  it('оставляет одиночный перевод строки внутри абзаца', () => {
    // Стихи и реплики беседы держатся на одиночных переводах — склеивать
    // их в строку нельзя.
    expect(normalizeEntryBody('Харе Кришна\nХаре Кришна')).toBe(
      'Харе Кришна\nХаре Кришна',
    );
  });

  it('сжимает серию пустых строк до одной', () => {
    expect(normalizeEntryBody('Абзац один\n\n\n\n\nАбзац два')).toBe(
      'Абзац один\n\nАбзац два',
    );
  });

  it('убирает пробелы в конце строк и по краям текста', () => {
    expect(normalizeEntryBody('  \n Текст  \t\nдальше   \n\n')).toBe(
      'Текст\nдальше',
    );
  });

  it('не трогает пробелы между словами', () => {
    expect(normalizeEntryBody('Слово за словом')).toBe('Слово за словом');
  });

  it('вычищает NUL, который Postgres не хранит в text', () => {
    const nul = String.fromCharCode(0);
    expect(normalizeEntryBody(`Лек${nul}ция`)).toBe('Лекция');
  });

  it('пустой текст и отсутствие текста — одно и то же', () => {
    expect(normalizeEntryBody('   \n\n  ')).toBeNull();
    expect(normalizeEntryBody('')).toBeNull();
    expect(normalizeEntryBody(null)).toBeNull();
    expect(normalizeEntryBody(undefined)).toBeNull();
  });
});

describe('entryLocatorError', () => {
  const none = { url: null, source: null, body: null };

  it('катхе нужен текст, даже когда есть адрес и источник', () => {
    expect(
      entryLocatorError({
        type: 'katha',
        url: 'https://example.com/lecture',
        source: 'Лекция, Лондон, 1972',
        body: null,
      }),
    ).toBe('body_required');
  });

  it('катхе хватает одного текста', () => {
    expect(
      entryLocatorError({ ...none, type: 'katha', body: 'Текст' }),
    ).toBeNull();
  });

  it('остальным хватает любого из трёх', () => {
    expect(
      entryLocatorError({ ...none, type: 'video', url: 'https://x.ru' }),
    ).toBeNull();
    expect(
      entryLocatorError({ ...none, type: 'book', source: 'Гита 9.22' }),
    ).toBeNull();
    // Текст остаётся у материала и после смены типа с катхи — это законно.
    expect(
      entryLocatorError({ ...none, type: 'article', body: 'Текст' }),
    ).toBeNull();
  });

  it('материал, которому не на что указывать, не принимается', () => {
    expect(entryLocatorError({ ...none, type: 'article' })).toBe(
      'url_or_source_required',
    );
  });
});
