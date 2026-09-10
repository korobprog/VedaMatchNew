/**
 * Штрихкод продукта: проверка и приведение к одному виду.
 *
 * Контрольная цифра считается не ради строгости, а ради базы: сканер иногда
 * читает код с ошибкой в одну цифру, и без проверки такой мусор заводит
 * продукт-двойник, который потом отвечает людям неправильным составом.
 *
 * UPC-A с американской упаковки — это EAN-13 с ведущим нулём. Приводим к
 * тринадцати цифрам, иначе одна и та же банка лежит в базе дважды.
 */

/** Длины, которые встречаются на еде. GTIN-14 — упаковка, коробка, ящик. */
const SUPPORTED_LENGTHS = [8, 12, 13, 14];

/** Убирает пробелы и дефисы: из ручного ввода они приходят постоянно. */
export function cleanBarcode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/**
 * Контрольная цифра GTIN. Считается справа налево по первым `n-1` цифрам с
 * чередованием весов 3 и 1 — одинаково для EAN-8, EAN-13, UPC-A и GTIN-14.
 */
export function barcodeCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i -= 1) {
    sum += Number(digitsWithoutCheck[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidBarcode(input: string): boolean {
  const code = cleanBarcode(input);
  if (!SUPPORTED_LENGTHS.includes(code.length)) return false;
  if (!/^\d+$/.test(code)) return false;
  const body = code.slice(0, -1);
  return barcodeCheckDigit(body) === Number(code[code.length - 1]);
}

/**
 * Канонический вид для хранения и поиска: тринадцать цифр там, где это
 * возможно. Возвращает `null`, если код не проходит проверку — звать такое
 * штрихкодом нельзя.
 */
export function normalizeBarcode(input: string): string | null {
  const code = cleanBarcode(input);
  if (!isValidBarcode(code)) return null;
  if (code.length === 12) return `0${code}`;
  if (code.length === 14 && code.startsWith('0')) return code.slice(1);
  return code;
}
