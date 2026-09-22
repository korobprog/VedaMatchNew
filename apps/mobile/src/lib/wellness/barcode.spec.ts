import {
  barcodeCheckDigit,
  barcodeFromScan,
  cleanBarcode,
  isValidBarcode,
  normalizeBarcode,
  readManualBarcode,
} from './barcode';

// Реальные коды с упаковок: «Алёнка» (EAN-13), UPC-A с американской банки,
// EAN-8 с маленькой пачки.
const ALENKA = '4600680000596';
const UPC = '012000161155';
const SHORT = '96385074';

describe('barcodeCheckDigit', () => {
  it('считает ту же цифру, что напечатана на упаковке', () => {
    expect(barcodeCheckDigit(ALENKA.slice(0, -1))).toBe(Number(ALENKA.at(-1)));
    expect(barcodeCheckDigit(UPC.slice(0, -1))).toBe(Number(UPC.at(-1)));
    expect(barcodeCheckDigit(SHORT.slice(0, -1))).toBe(Number(SHORT.at(-1)));
  });
});

describe('isValidBarcode', () => {
  it.each([ALENKA, UPC, SHORT])('«%s» — настоящий код', (code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it('ошибка в одну цифру не проходит — именно её и ловит контрольная', () => {
    expect(isValidBarcode('4600680000597')).toBe(false);
    expect(isValidBarcode('4600680000696')).toBe(false);
  });

  it.each([
    ['', 'пусто'],
    ['460068', 'коротко'],
    ['460068000059612345', 'длинно'],
    ['460068000059a', 'буква'],
  ])('«%s» (%s) — не код', (input) => {
    expect(isValidBarcode(input)).toBe(false);
  });

  it('пробелы и дефисы ручного ввода не мешают', () => {
    expect(cleanBarcode('4-600 680 000596')).toBe(ALENKA);
    expect(isValidBarcode('4 600680 000596')).toBe(true);
  });
});

describe('normalizeBarcode', () => {
  it('UPC-A доводится до тринадцати цифр — иначе банка ляжет в базу дважды', () => {
    expect(normalizeBarcode(UPC)).toBe(`0${UPC}`);
  });

  it('EAN-13 остаётся собой', () => {
    expect(normalizeBarcode(ALENKA)).toBe(ALENKA);
  });

  it('EAN-8 не растягивается: это самостоятельная длина', () => {
    expect(normalizeBarcode(SHORT)).toBe(SHORT);
  });

  it('не прошедшее проверку — null, а не «почти код»', () => {
    expect(normalizeBarcode('4600680000597')).toBeNull();
    expect(normalizeBarcode('abc')).toBeNull();
  });
});

describe('barcodeFromScan', () => {
  it('обычный код с упаковки проходит как есть', () => {
    expect(barcodeFromScan(ALENKA)).toBe(ALENKA);
    expect(barcodeFromScan(UPC)).toBe(`0${UPC}`);
  });

  it('GS1-128 со скобками: достаём GTIN из-под идентификатора 01', () => {
    expect(barcodeFromScan('(01)04600680000596')).toBe(ALENKA);
  });

  it('GS1-128 слитно, как приходит из камеры', () => {
    expect(barcodeFromScan('0104600680000596')).toBe(ALENKA);
  });

  it('хвост после GTIN не мешает: там срок годности и партия', () => {
    expect(barcodeFromScan('010460068000059617260101')).toBe(ALENKA);
  });

  it('ссылка с ценника кодом не притворяется', () => {
    expect(barcodeFromScan('https://example.com/promo')).toBeNull();
  });

  it('внутренний артикул магазина отвергается', () => {
    expect(barcodeFromScan('ART-99120')).toBeNull();
  });

  it('GS1-128 с испорченным GTIN не проходит контрольную цифру', () => {
    expect(barcodeFromScan('0104600680000597')).toBeNull();
  });
});

describe('readManualBarcode', () => {
  it('пустое поле — ни подсказки, ни ругани', () => {
    expect(readManualBarcode('')).toEqual({ kind: 'empty' });
    expect(readManualBarcode('   ')).toEqual({ kind: 'empty' });
  });

  it('недобранные цифры — счётчик, а не ошибка', () => {
    const state = readManualBarcode('460');
    expect(state.kind).toBe('typing');
    expect(state.kind === 'typing' && state.hint).toContain('3 из 8');
  });

  it('полная длина с неверной контрольной — ошибка с объяснением', () => {
    const state = readManualBarcode('4600680000597');
    expect(state.kind).toBe('invalid');
    expect(state.kind === 'invalid' && state.hint).toContain('контрольной');
  });

  it('буквы в поле названы прямо', () => {
    const state = readManualBarcode('46006a');
    expect(state.kind).toBe('invalid');
    expect(state.kind === 'invalid' && state.hint).toContain('только цифры');
  });

  it('слишком длинный ввод не притворяется недобранным', () => {
    const state = readManualBarcode('460068000059612345');
    expect(state.kind).toBe('invalid');
    expect(state.kind === 'invalid' && state.hint).toContain('14');
  });

  it('готовый код отдаётся уже приведённым', () => {
    expect(readManualBarcode(`  ${UPC} `)).toEqual({
      kind: 'ready',
      barcode: `0${UPC}`,
    });
  });

  it('между длинами счётчик показывает следующую, а не тринадцать всегда', () => {
    const nine = readManualBarcode('123456789');
    expect(nine.kind === 'typing' && nine.hint).toContain('из 12');
  });
});
