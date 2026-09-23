import { collapseBlankLines } from '@vedamatch/shared';
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

/**
 * VED-372: форма статьи и катхи убирает пустые строки портальной
 * `collapseBlankLines`. Сервер не должен переделывать её результат при
 * сохранении — иначе автор видит в форме одно, а читатель получает другое.
 */
describe('normalizeEntryBody и уборка пустых строк в форме', () => {
  // Вставка из мессенджера: «пустые» строки из пробелов и табуляций.
  const pasted = 'Абзац один\n   \n\t\nАбзац два\n\n\n\nАбзац три';

  it.each([0, 1])(
    'сохраняет текст, убранный с «оставлять %i», без изменений',
    (keep) => {
      const { text } = collapseBlankLines(pasted, keep);
      expect(normalizeEntryBody(text)).toBe(text);
    },
  );

  it('«ни одной» склеивает абзацы в строки, и сервер этого не отменяет', () => {
    expect(normalizeEntryBody(collapseBlankLines(pasted, 0).text)).toBe(
      'Абзац один\nАбзац два\nАбзац три',
    );
  });

  // Поэтому в форме «Образования» нет варианта «две»: сервер хранит не
  // больше одной пустой строки, и выбор молча превращался бы в «одну».
  it('двух пустых строк подряд не хранит', () => {
    const { text } = collapseBlankLines(pasted, 2);
    expect(normalizeEntryBody(text)).toBe(collapseBlankLines(pasted, 1).text);
  });
});
