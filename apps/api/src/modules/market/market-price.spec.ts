import {
  MAX_PRICE_MINOR,
  formatPriceMinor,
  isPricelessMode,
  parsePriceMajor,
  validatePrice,
} from './market-price';

describe('parsePriceMajor', () => {
  it('converts plain numbers to minor units', () => {
    expect(parsePriceMajor(1299)).toBe(129900);
    expect(parsePriceMajor(0)).toBe(0);
  });

  it('accepts the shapes a russian keyboard produces', () => {
    expect(parsePriceMajor('1299,50')).toBe(129950);
    expect(parsePriceMajor('1 299,50')).toBe(129950);
    expect(parsePriceMajor('1299.5')).toBe(129950);
    // Неразрывный пробел — то, что вставляет Word и часть браузеров.
    expect(parsePriceMajor('1 299')).toBe(129900);
  });

  it('rounds binary floating point instead of truncating it', () => {
    // 0.1 + 0.2 = 0.30000000000000004; усечение дало бы 29 копеек.
    expect(parsePriceMajor(0.1 + 0.2)).toBe(30);
    expect(parsePriceMajor('19.99')).toBe(1999);
  });

  it('rejects everything that is not a non-negative decimal', () => {
    expect(parsePriceMajor('-5')).toBeNull();
    expect(parsePriceMajor(-5)).toBeNull();
    expect(parsePriceMajor('abc')).toBeNull();
    expect(parsePriceMajor('12abc')).toBeNull();
    expect(parsePriceMajor(Number.NaN)).toBeNull();
    expect(parsePriceMajor(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parsePriceMajor({})).toBeNull();
    expect(parsePriceMajor(true)).toBeNull();
  });

  it('treats empty input as absent, not as zero', () => {
    expect(parsePriceMajor(null)).toBeNull();
    expect(parsePriceMajor(undefined)).toBeNull();
    expect(parsePriceMajor('')).toBeNull();
  });

  it('refuses values that would overflow the Int column', () => {
    expect(parsePriceMajor(MAX_PRICE_MINOR / 100)).toBe(MAX_PRICE_MINOR);
    expect(parsePriceMajor(MAX_PRICE_MINOR / 100 + 1)).toBeNull();
  });
});

describe('formatPriceMinor', () => {
  // Разделитель разрядов и отбивка перед знаком валюты — неразрывные пробелы,
  // чтобы «1 299 ₽» не рвалось переносом строки. В ожиданиях они записаны
  // escape-последовательностью: literal NBSP в тесте не видно при ревью.
  const NBSP = '\u00a0';

  it('hides a zero fraction and groups thousands', () => {
    expect(formatPriceMinor(129900, 'rub')).toBe(`1${NBSP}299${NBSP}₽`);
    expect(formatPriceMinor(100000000, 'rub')).toBe(
      `1${NBSP}000${NBSP}000${NBSP}₽`,
    );
    expect(formatPriceMinor(0, 'rub')).toBe(`0${NBSP}₽`);
  });

  it('keeps a non-zero fraction padded to two digits', () => {
    expect(formatPriceMinor(129950, 'rub')).toBe(`1${NBSP}299,50${NBSP}₽`);
    expect(formatPriceMinor(1905, 'usd')).toBe(`19,05${NBSP}$`);
  });

  it('uses the symbol of each supported currency', () => {
    expect(formatPriceMinor(10000, 'usd')).toBe(`100${NBSP}$`);
    expect(formatPriceMinor(10000, 'eur')).toBe(`100${NBSP}€`);
    expect(formatPriceMinor(10000, 'inr')).toBe(`100${NBSP}₹`);
  });

  it('never uses a breakable space', () => {
    expect(formatPriceMinor(129950, 'rub')).not.toContain(' ');
  });
});

describe('isPricelessMode', () => {
  it('covers exactly negotiable and free', () => {
    expect(isPricelessMode('negotiable')).toBe(true);
    expect(isPricelessMode('free')).toBe(true);
    expect(isPricelessMode('fixed')).toBe(false);
    expect(isPricelessMode('from')).toBe(false);
  });
});

describe('validatePrice', () => {
  it('requires a price for fixed and from', () => {
    expect(validatePrice({ mode: 'fixed', minor: null, maxMinor: null })).toBe(
      'price_required',
    );
    expect(validatePrice({ mode: 'from', minor: null, maxMinor: null })).toBe(
      'price_required',
    );
    expect(validatePrice({ mode: 'fixed', minor: 50000, maxMinor: null })).toBeNull();
  });

  it('forbids a price on negotiable and free', () => {
    expect(
      validatePrice({ mode: 'negotiable', minor: 50000, maxMinor: null }),
    ).toBe('price_invalid');
    expect(validatePrice({ mode: 'free', minor: 1, maxMinor: null })).toBe(
      'price_invalid',
    );
    expect(
      validatePrice({ mode: 'negotiable', minor: null, maxMinor: null }),
    ).toBeNull();
    expect(validatePrice({ mode: 'free', minor: null, maxMinor: null })).toBeNull();
  });

  it('allows an upper bound only on from, and only above the lower one', () => {
    expect(
      validatePrice({ mode: 'from', minor: 50000, maxMinor: 90000 }),
    ).toBeNull();
    expect(validatePrice({ mode: 'from', minor: 50000, maxMinor: 50000 })).toBe(
      'price_invalid',
    );
    expect(validatePrice({ mode: 'from', minor: 50000, maxMinor: 10000 })).toBe(
      'price_invalid',
    );
    expect(
      validatePrice({ mode: 'fixed', minor: 50000, maxMinor: 90000 }),
    ).toBe('price_invalid');
  });

  it('rejects negative and non-integer minor units', () => {
    expect(validatePrice({ mode: 'fixed', minor: -1, maxMinor: null })).toBe(
      'price_invalid',
    );
    expect(validatePrice({ mode: 'fixed', minor: 10.5, maxMinor: null })).toBe(
      'price_invalid',
    );
  });

  it('reports overflow separately from a malformed price', () => {
    expect(
      validatePrice({ mode: 'fixed', minor: MAX_PRICE_MINOR, maxMinor: null }),
    ).toBeNull();
    expect(
      validatePrice({ mode: 'fixed', minor: MAX_PRICE_MINOR + 1, maxMinor: null }),
    ).toBe('price_too_large');
    expect(
      validatePrice({
        mode: 'from',
        minor: 1000,
        maxMinor: MAX_PRICE_MINOR + 1,
      }),
    ).toBe('price_too_large');
  });
});
