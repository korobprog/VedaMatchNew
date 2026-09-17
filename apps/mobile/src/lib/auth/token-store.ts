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
  try {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  } catch (error) {
    // Android Keystore может отказать на чтение (повреждён ключ, сменилась
    // блокировка экрана и т.п.) — снаружи (`token-authority.ts`) это и
    // «токенов правда нет» выглядят одинаково (`null`), но молчать о
    // разнице нельзя: человек без объяснения окажется разлогинен, хотя
    // токены на самом деле никуда не делись (`gan-harness/feedback/feedback-002.md`,
    // важное п.2). В лог — только тип/код ошибки, самих значений токенов
    // здесь и не могло оказаться: чтение как раз не удалось.
    console.warn('[token-store] SecureStore.getItemAsync упал при чтении токенов:', describeStorageError(error));
    return null;
  }
}

function describeStorageError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
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
