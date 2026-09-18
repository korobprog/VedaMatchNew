import { bytesToHex, decodeBase64ToBytes } from './binary-utils';

// Векторы RFC 4648 §10 — общепринятый набор проверки base64.
const RFC_4648_VECTORS: [string, string][] = [
  ['', ''],
  ['Zg==', 'f'],
  ['Zm8=', 'fo'],
  ['Zm9v', 'foo'],
  ['Zm9vYg==', 'foob'],
  ['Zm9vYmE=', 'fooba'],
  ['Zm9vYmFy', 'foobar'],
];

/** Детерминированный генератор (LCG), чтобы тест не зависел от случайности прогона. */
function randomBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

function textBytes(text: string): Uint8Array {
  return new Uint8Array(Array.from(text).map((char) => char.codePointAt(0)!));
}

describe('decodeBase64ToBytes', () => {
  it.each(RFC_4648_VECTORS)('декодирует "%s" в байты "%s" (RFC 4648)', (base64, expectedText) => {
    expect(Array.from(decodeBase64ToBytes(base64))).toEqual(Array.from(textBytes(expectedText)));
  });

  it('падает на недопустимом символе, а не молча пропускает его', () => {
    expect(() => decodeBase64ToBytes('Zm9v!')).toThrow('недопустимый символ base64');
  });

  it('переносы строк в теле base64 (частая форма ответа хранилищ) не мешают декодированию', () => {
    expect(Array.from(decodeBase64ToBytes('Zm9v\nYmFy'))).toEqual(Array.from(textBytes('foobar')));
    expect(Array.from(decodeBase64ToBytes('Zm9v\r\nYmE=\r\n'))).toEqual(Array.from(textBytes('fooba')));
  });

  it('совпадает с Buffer из Node на случайных байтах любой длины (все 256 значений байта)', () => {
    for (let length = 0; length < 300; length += 1) {
      const bytes = randomBytes(length, length + 1);
      const base64 = Buffer.from(bytes).toString('base64');
      expect(Buffer.from(decodeBase64ToBytes(base64)).equals(Buffer.from(bytes))).toBe(true);
    }
  });

  it('все 64 символа алфавита декодируются в свои значения', () => {
    const allSymbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    expect(Buffer.from(decodeBase64ToBytes(allSymbols)).equals(Buffer.from(allSymbols, 'base64'))).toBe(true);
  });

  it('символ вне ASCII и URL-safe алфавит не принимаются', () => {
    expect(() => decodeBase64ToBytes('Zm9vЖ')).toThrow('недопустимый символ base64');
    // Каждый символ URL-safe алфавита — отдельно: в паре '-_' мутант,
    // принимающий '-', выживал за счёт '_' (раунд 002, замечание 6).
    expect(() => decodeBase64ToBytes('Zm9-')).toThrow('недопустимый символ base64 "-"');
    expect(() => decodeBase64ToBytes('Zm9_')).toThrow('недопустимый символ base64 "_"');
  });

  it('данные после "=" — ошибка, а не молчаливая склейка двух кусков', () => {
    expect(() => decodeBase64ToBytes('Zg==Zm9v')).toThrow('символ после "="');
  });
});

describe('bytesToHex', () => {
  it('переводит байты в нижнерегистровый hex с ведущими нулями', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('принимает ArrayBuffer наравне с Uint8Array', () => {
    const buffer = new Uint8Array([0xab, 0xcd]).buffer;
    expect(bytesToHex(buffer)).toBe('abcd');
  });

  it('пустые байты — пустая строка', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });
});
