/**
 * Штрихкод в приложении: проверка перед отправкой на сервер (VED-335).
 *
 * Правила те же, что у сервера (`apps/api/src/modules/wellness/barcode.ts`), и
 * продублированы здесь намеренно, а не вытащены в общий пакет. Причина не в
 * контракте сервисного модуля (он про API), а в назначении: серверная копия —
 * последнее слово и защита базы от кода-двойника, эта — подсказка человеку в
 * момент набора, до всякой сети. Слить их в одну значило бы, что телефон без
 * связи молчит там, где мог бы сразу сказать «вы ошиблись цифрой».
 *
 * Контрольная цифра считается не ради строгости: камера иногда читает код с
 * ошибкой в одну цифру, и без проверки такой мусор уходит на сервер, а человек
 * получает «товар не найден» вместо «перепроверьте код».
 */

/** Длины, которые встречаются на еде. GTIN-14 — короб, ящик, упаковка. */
const SUPPORTED_LENGTHS = [8, 12, 13, 14];

/** Пробелы и дефисы из ручного ввода приходят постоянно. */
export function cleanBarcode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/**
 * Контрольная цифра GTIN: справа налево по первым `n-1` цифрам с чередованием
 * весов 3 и 1 — одинаково для EAN-8, EAN-13, UPC-A и GTIN-14.
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
  return barcodeCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Канонический вид: тринадцать цифр там, где это возможно. `null` — код не
 * прошёл проверку, звать такое штрихкодом нельзя.
 */
export function normalizeBarcode(input: string): string | null {
  const code = cleanBarcode(input);
  if (!isValidBarcode(code)) return null;
  if (code.length === 12) return `0${code}`;
  if (code.length === 14 && code.startsWith('0')) return code.slice(1);
  return code;
}

/**
 * Код, пришедший из камеры. Отдельно от `normalizeBarcode`, потому что камера
 * приносит не только голые цифры.
 *
 * На еде в России почти всегда EAN-13, на мелких пачках — EAN-8, на
 * импорте — UPC. Но на коробах и части фасовки встречается GS1-128, где
 * настоящий код спрятан внутри строки за идентификатором применения `01`:
 * «(01)04600680000596» или «0104600680000596» слитно. Если такую строку
 * отдать как есть, сервер не найдёт ничего, а человек решит, что товара нет
 * в базе, — поэтому GTIN из неё достаём сами.
 *
 * Строки, которые кодом не оказались (ссылка с ценника, внутренний артикул
 * магазина), возвращают `null`: рамка останется жёлтой, и следующий кадр
 * может сойтись.
 */
export function barcodeFromScan(data: string): string | null {
  const direct = normalizeBarcode(data);
  if (direct) return direct;

  // GS1-128: скобки вокруг идентификаторов применения печатают для людей, в
  // самих данных их нет. Убираем и смотрим на `01` + 14 цифр GTIN.
  const plain = data.replace(/[()\s-]/g, '');
  const gs1 = /^01(\d{14})/.exec(plain);
  return gs1 ? normalizeBarcode(gs1[1]) : null;
}

/** Что показать под полем ручного ввода, пока человек набирает. */
export type ManualBarcodeState =
  | { kind: 'empty' }
  | { kind: 'typing'; hint: string }
  | { kind: 'invalid'; hint: string }
  | { kind: 'ready'; barcode: string };

/**
 * Разбор ручного ввода. Отдельно от `normalizeBarcode`, потому что отвечает
 * на другой вопрос: не «это штрихкод?», а «что сейчас сказать человеку?».
 *
 * Недобранные цифры — не ошибка: ругаться на третьем символе из тринадцати
 * значит мешать. Ошибка — только полная длина с неверной контрольной цифрой
 * и буквы в поле.
 */
export function readManualBarcode(input: string): ManualBarcodeState {
  const code = cleanBarcode(input);
  if (!code) return { kind: 'empty' };
  if (!/^\d+$/.test(code)) {
    return { kind: 'invalid', hint: 'В штрихкоде только цифры.' };
  }
  const normalized = normalizeBarcode(code);
  if (normalized) return { kind: 'ready', barcode: normalized };
  if (SUPPORTED_LENGTHS.includes(code.length)) {
    return {
      kind: 'invalid',
      hint: 'Проверьте цифры: такой код не сходится с контрольной цифрой.',
    };
  }
  if (code.length > 14) {
    return { kind: 'invalid', hint: 'В штрихкоде не больше 14 цифр.' };
  }
  const next = SUPPORTED_LENGTHS.find((length) => length > code.length) ?? 13;
  return {
    kind: 'typing',
    hint: `Набрано ${code.length} из ${next} цифр.`,
  };
}
