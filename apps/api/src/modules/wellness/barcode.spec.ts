import {
  barcodeCheckDigit,
  cleanBarcode,
  isValidBarcode,
  normalizeBarcode,
} from './barcode';

describe('barcodeCheckDigit', () => {
  it('считает цифру EAN-13', () => {
    expect(barcodeCheckDigit('590123412345')).toBe(7);
  });

  it('считает цифру EAN-8', () => {
    expect(barcodeCheckDigit('9638507')).toBe(4);
  });

  it('считает цифру UPC-A', () => {
    expect(barcodeCheckDigit('03600029145')).toBe(2);
  });
});

describe('cleanBarcode', () => {
  it('убирает пробелы и дефисы из ручного ввода', () => {
    expect(cleanBarcode('5 901234-123457')).toBe('5901234123457');
  });
});

describe('isValidBarcode', () => {
  it('принимает EAN-13, EAN-8 и UPC-A', () => {
    expect(isValidBarcode('5901234123457')).toBe(true);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
  });

  it('принимает код с пробелами: так его вводят руками', () => {
    expect(isValidBarcode('5 901234 123457')).toBe(true);
  });

  it('отвергает код с ошибкой в одной цифре — это и есть продукт-двойник', () => {
    expect(isValidBarcode('5901234123458')).toBe(false);
  });

  it('отвергает нецифры и чужие длины', () => {
    expect(isValidBarcode('590123412345A')).toBe(false);
    expect(isValidBarcode('123456')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });
});

describe('normalizeBarcode', () => {
  it('дотягивает UPC-A до тринадцати цифр, чтобы банка не легла в базу дважды', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });

  it('снимает ведущий ноль у GTIN-14 с коробки', () => {
    expect(normalizeBarcode('05901234123457')).toBe('5901234123457');
  });

  it('оставляет EAN-13 и EAN-8 как есть', () => {
    expect(normalizeBarcode('5901234123457')).toBe('5901234123457');
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });

  it('возвращает null на непроверяемом коде', () => {
    expect(normalizeBarcode('5901234123458')).toBeNull();
  });
});
