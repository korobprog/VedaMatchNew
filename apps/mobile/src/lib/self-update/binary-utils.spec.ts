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
