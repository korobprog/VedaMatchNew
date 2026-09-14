import * as SecureStore from 'expo-secure-store';

/**
 * Хранилище токенов в Android Keystore через expo-secure-store.
 *
 * AsyncStorage сюда не подходит: он пишет в обычный файл, и refresh-токен на
 * 30 дней оказался бы доступен любому, кто снимет резервную копию телефона.
 */

const ACCESS_KEY = 'vm.accessToken';
const REFRESH_KEY = 'vm.refreshToken';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function readTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function writeTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
