/**
 * Токены гостевых заявок в браузере. Гость со страницы по QR оставил заявку
 * без аккаунта; токен лежит здесь, а не в адресе — ссылка с токеном ушла бы
 * в историю браузера и логи. После входа «Мои заявки» забирают заявки сами.
 */

export const CLAIM_TOKENS_KEY = "vm.travel.claimTokens";

/** Столько заявок гость с одного телефона не оставляет; старые — вытесняются. */
export const MAX_CLAIM_TOKENS = 20;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function parseClaimTokens(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (token): token is string =>
            typeof token === "string" && TOKEN_PATTERN.test(token),
        ),
      ),
    ].slice(-MAX_CLAIM_TOKENS);
  } catch {
    return [];
  }
}

export function withClaimToken(tokens: string[], token: string): string[] {
  if (!TOKEN_PATTERN.test(token)) return tokens;
  return [...tokens.filter((item) => item !== token), token].slice(
    -MAX_CLAIM_TOKENS,
  );
}

export function withoutClaimTokens(
  tokens: string[],
  done: readonly string[],
): string[] {
  return tokens.filter((token) => !done.includes(token));
}

export function readClaimTokens(): string[] {
  try {
    return parseClaimTokens(window.localStorage.getItem(CLAIM_TOKENS_KEY));
  } catch {
    return [];
  }
}

export function saveClaimTokens(tokens: string[]): void {
  try {
    if (tokens.length) {
      window.localStorage.setItem(CLAIM_TOKENS_KEY, JSON.stringify(tokens));
    } else {
      window.localStorage.removeItem(CLAIM_TOKENS_KEY);
    }
  } catch {
    // Приватный режим: заявка всё равно ушла хозяину, не привяжется только
    // к кабинету.
  }
}
