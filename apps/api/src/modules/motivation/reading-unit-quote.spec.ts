import {
  readingUnitQuote,
  readingUnitsOf,
  stripHtml,
} from './reading-unit-quote';

describe('readingUnitQuote', () => {
  it('берёт перевод, а не транслитерацию и пословный разбор', () => {
    const unit = {
      title: 'Стих 1.23',
      originalHtml: '<p>योत्स्यमानान्</p>',
      transliterationHtml: '<p>йотсйаманан авекше</p>',
      synonymsHtml: '<p>ахам — я; йе — которые</p>',
      translationHtml:
        '<p>Позволь мне взглянуть на тех, кто пришёл сюда сражаться.</p>',
      purportHtml: '<p>Комментарий Прабхупады…</p>',
    };

    expect(readingUnitQuote(unit)).toBe(
      'Позволь мне взглянуть на тех, кто пришёл сюда сражаться.',
    );
  });

  it('у прозы берёт её текст: стиха там нет', () => {
    expect(readingUnitQuote({ bodyHtml: '<p>Лекция в Бомбее.</p>' })).toBe(
      'Лекция в Бомбее.',
    );
  });

  it('комментарий цитатой не предлагает', () => {
    // Комментарий — слова комментатора о стихе, и подпись «автор · стих»
    // оказалась бы неверной.
    expect(readingUnitQuote({ purportHtml: '<p>Комментарий</p>' })).toBe('');
    expect(readingUnitQuote({})).toBe('');
  });

  it('разбирает разметку и сущности', () => {
    expect(stripHtml('<p>Слово&nbsp;&mdash; дело</p>')).toBe('Слово — дело');
    expect(stripHtml('<em>а</em>\n<em>б</em>')).toBe('а б');
    expect(stripHtml('&laquo;Гита&raquo;')).toBe('«Гита»');
  });
});

describe('readingUnitsOf', () => {
  it('достаёт единицы главы', () => {
    expect(readingUnitsOf({ units: [{ id: '1' }, { id: '2' }] })).toHaveLength(
      2,
    );
  });

  it('не падает на неожиданной форме payload', () => {
    // Payload лежит в базе как JSON: его структура типами не гарантируется.
    expect(readingUnitsOf(null)).toEqual([]);
    expect(readingUnitsOf('текст')).toEqual([]);
    expect(readingUnitsOf({ units: 'нет' })).toEqual([]);
    expect(readingUnitsOf({ units: [null, { id: '1' }] })).toHaveLength(1);
  });
});
