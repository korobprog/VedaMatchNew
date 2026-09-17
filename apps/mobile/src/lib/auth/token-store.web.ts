import type { TokenPair } from './token-store';

/**
 * Веб-версия токенов в JS не держит: сессия — httpOnly cookie портала
 * (`session.web.tsx`). Хранилище пустое, чтобы общий код (`token-authority`),
 * попавший в веб-сборку транзитом, не трогал `localStorage`.
 */

export type { TokenPair };

export async function readTokens(): Promise<TokenPair | null> {
  return null;
}

export async function writeTokens(_tokens: TokenPair): Promise<void> {
  // Намеренно ничего: см. комментарий к модулю.
}

export async function clearTokens(): Promise<void> {
  // Намеренно ничего: см. комментарий к модулю.
}
