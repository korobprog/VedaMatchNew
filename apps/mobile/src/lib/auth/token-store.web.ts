import type { TokenPair } from './token-store';

/**
 * Веб-сборка: у expo-secure-store нет браузерной реализации.
 * РАЗВЕДКА: localStorage доступен любому скрипту страницы (XSS). Для
 * ios.vedamatch.com refresh-токен должен жить в httpOnly cookie API —
 * решение в плане, здесь только чтобы увидеть экраны.
 */

const ACCESS_KEY = 'vm.accessToken';
const REFRESH_KEY = 'vm.refreshToken';

export type { TokenPair };

export async function readTokens(): Promise<TokenPair | null> {
  const accessToken = globalThis.localStorage?.getItem(ACCESS_KEY);
  const refreshToken = globalThis.localStorage?.getItem(REFRESH_KEY);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function writeTokens(tokens: TokenPair): Promise<void> {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
