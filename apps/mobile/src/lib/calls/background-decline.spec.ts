import { createBackgroundDecline } from './background-decline';

const tokenStore = {
  tokens: null as { accessToken: string; refreshToken: string } | null,
};

jest.mock('@/config/app-variant', () => ({
  appVariant: () => ({ apiOrigin: 'https://api.example', contour: 'ru', channel: 'site' }),
}));

jest.mock('@/lib/auth/token-store', () => ({
  readTokens: async () => tokenStore.tokens,
  writeTokens: async (pair: { accessToken: string; refreshToken: string }) => {
    tokenStore.tokens = pair;
  },
  clearTokens: async () => {
    tokenStore.tokens = null;
  },
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createBackgroundDecline', () => {
  beforeEach(() => {
    tokenStore.tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };
  });

  it('нет токенов в хранилище — ничего не отправляет, отдаёт false', async () => {
    tokenStore.tokens = null;
    const fetchImpl = jest.fn();
    const decline = createBackgroundDecline({ fetchImpl });
    await expect(decline('call-1')).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('access-токен живой — один POST с Bearer, успех', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example/chat/calls/call-1/decline');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
      return jsonResponse(200, { ok: true });
    });
    const decline = createBackgroundDecline({ fetchImpl });
    await expect(decline('call-1')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401 — обновляет токен один раз и повторяет запрос', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/app/refresh')) {
        return jsonResponse(200, {
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
          refreshExpiresIn: 2_592_000,
        });
      }
      calls += 1;
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer access-1') return jsonResponse(401, { message: 'expired' });
      expect(auth).toBe('Bearer access-2');
      return jsonResponse(200, { ok: true });
    });
    const decline = createBackgroundDecline({ fetchImpl });
    await expect(decline('call-1')).resolves.toBe(true);
    expect(calls).toBe(2);
    expect(tokenStore.tokens?.accessToken).toBe('access-2');
  });

  it('звонок уже закрыт на сервере — false, не бросает', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(404, { message: 'Звонок не найден' }));
    const decline = createBackgroundDecline({ fetchImpl });
    await expect(decline('call-1')).resolves.toBe(false);
  });

  it('refresh не помог (сессия истекла) — false, токены очищены', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/app/refresh')) return jsonResponse(401, { message: 'revoked' });
      const auth = (init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe('Bearer access-1');
      return jsonResponse(401, { message: 'expired' });
    });
    const decline = createBackgroundDecline({ fetchImpl });
    await expect(decline('call-1')).resolves.toBe(false);
    expect(tokenStore.tokens).toBeNull();
  });
});
