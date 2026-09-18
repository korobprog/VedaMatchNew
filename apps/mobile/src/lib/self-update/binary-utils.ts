/**
 * Байтовые хелперы для проверки скачанного APK (VED-176): expo-crypto умеет
 * хешировать только строку (UTF-8) или готовый `BufferSource` — файл нужно
 * сперва прочитать как base64 (`expo-file-system/legacy`) и раскодировать в
 * байты, а посчитанный `ArrayBuffer`-дайджест — перевести в hex для
 * сравнения со строкой `sha256` из манифеста (`sha256-verify.ts`). Обе
 * функции чистые (не читают диск, не трогают сеть) — вынесены отдельно,
 * чтобы декодер base64 и перевод в hex были покрыты тестом сами по себе, а
 * не только косвенно, через нетестируемую обёртку `apk-downloader.ts`.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Декодирует base64-строку (как отдаёт `FileSystem.readAsStringAsync`) в байты. */
export function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n]/g, '');
  const withoutPadding = clean.replace(/=+$/, '');
  if (withoutPadding.length === 0) return new Uint8Array(0);

  const byteLength = Math.floor((withoutPadding.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < withoutPadding.length; i += 1) {
    const char = withoutPadding[i];
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`decodeBase64ToBytes: недопустимый символ base64 "${char}"`);
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex] = (buffer >> bitsCollected) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes;
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
