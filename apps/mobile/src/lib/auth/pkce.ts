/**
 * PKCE для входа через системный браузер (RFC 7636).
 *
 * Верификатор остаётся в приложении, наружу уходит только challenge. Код,
 * который API вернёт через `vedamatch://auth`, без верификатора бесполезен,
 * даже если его перехватит другое приложение с той же схемой.
 *
 * Криптография передаётся снаружи: в приложении это expo-crypto, в тестах
 * node:crypto. Сам модуль ничего не знает о платформе.
 */

export interface PkceCrypto {
  randomBytes(length: number): Uint8Array;
  /** SHA-256 от строки, результат в обычном base64. */
  sha256Base64(input: string): Promise<string>;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64[a >> 2];
    out += BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += BASE64[c & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64ToBase64Url(base64: string): string {
  return base64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function createPkcePair(crypto: PkceCrypto): Promise<PkcePair> {
  // 32 байта дают 43 символа base64url — минимально допустимая длина RFC.
  const verifier = bytesToBase64Url(crypto.randomBytes(32));
  const challenge = base64ToBase64Url(await crypto.sha256Base64(verifier));
  return { verifier, challenge };
}
