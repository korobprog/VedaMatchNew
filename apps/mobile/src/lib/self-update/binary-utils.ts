/**
 * Байтовые хелперы проверки скачанного APK (VED-176). Основной путь чтения
 * файла (`apk-downloader.ts`) отдаёт байты напрямую (`FileHandle.readBytes`
 * из `expo-file-system`), а запасной — старый `readAsStringAsync` с
 * `position`/`length` — только base64-строкой: её и раскодирует
 * `decodeBase64ToBytes`, по куску за раз. `bytesToHex` переводит дайджест в
 * hex для сравнения со `sha256` из манифеста. Обе функции чистые.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Таблица «код символа → значение 0..63», -1 — недопустимый символ. Итерация 1
 * искала каждый символ `BASE64_ALPHABET.indexOf` — линейный проход по
 * алфавиту на каждый из ~217 млн символов APK (замер оценщика: ~6,4 с на
 * 155 МБ в V8, синхронно на JS-потоке). Поиск по таблице — O(1) на символ.
 */
const DECODE_TABLE: Int8Array = (() => {
  const table = new Int8Array(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) table[BASE64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

const CHAR_LF = 10;
const CHAR_CR = 13;
const CHAR_PAD = 61; // '='

/** Декодирует base64-строку (как отдаёт `FileSystem.readAsStringAsync`) в байты за один линейный проход. */
export function decodeBase64ToBytes(base64: string): Uint8Array {
  const out = new Uint8Array(Math.floor((base64.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;
  let sawPadding = false;

  for (let i = 0; i < base64.length; i += 1) {
    const code = base64.charCodeAt(i);
    // Переносы строк встречаются в ответах некоторых хранилищ — пропускаем.
    if (code === CHAR_LF || code === CHAR_CR) continue;
    if (code === CHAR_PAD) {
      sawPadding = true;
      continue;
    }
    const value = code < 256 ? DECODE_TABLE[code] : -1;
    if (value === -1 || sawPadding) {
      const reason = sawPadding && value !== -1 ? 'символ после "="' : `"${base64[i]}"`;
      throw new Error(`decodeBase64ToBytes: недопустимый символ base64 ${reason}`);
    }
    buffer = ((buffer << 6) | value) & 0xffffff;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      out[byteIndex] = (buffer >> bitsCollected) & 0xff;
      byteIndex += 1;
    }
  }

  return byteIndex === out.length ? out : out.slice(0, byteIndex);
}

/** `ArrayBuffer`/`Uint8Array` дайджеста → нижнерегистровый hex, как в манифесте. */
export function bytesToHex(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
