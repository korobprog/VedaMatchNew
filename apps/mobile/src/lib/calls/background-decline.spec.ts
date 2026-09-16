import type { TokenAuthority } from '@/lib/auth/token-authority';
import { createBackgroundDecline } from './background-decline';

jest.mock('@/config/app-variant', () => ({
  appVariant: () => ({ apiOrigin: 'https://api.example', contour: 'ru', channel: 'site' }),
}));

function fakeAuthority(overrides: Partial<TokenAuthority> = {}): TokenAuthority {
  return {
    peekAccessToken: () => null,
    getAccessToken: async () => 'access-1',
    rereadAccessToken: async () => null,
    refresh: async () => ({ kind: 'rejected' }),
    adopt: async () => undefined,
    drop: async () => undefined,
    hydrate: async () => null,
    subscribe: () => () => undefined,
    ...overrides,
  };
}

function jsonResponse(status: number): Response {
  return new Response(status === 204 ? '' : JSON.stringify({}), { status });
}

describe('createBackgroundDecline', () => {
  it('нет токена вовсе — не отправляет запрос, отдаёт false', async () => {
    const fetchImpl = jest.fn();
    const authority = fakeAuthority({ getAccessToken: async () => null });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: authority });
    await expect(decline('call-1')).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('access живой — один POST с Bearer, успех', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example/chat/calls/call-1/decline');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
      return jsonResponse(200);
    });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: fakeAuthority() });
    await expect(decline('call-1')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401, но перечитанный токен уже свежий (обновлён другим участником) — повторяет без refresh()', async () => {
    const refresh = jest.fn();
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer access-1') return jsonResponse(401);
      expect(auth).toBe('Bearer access-2');
      return jsonResponse(200);
    });
    const authority = fakeAuthority({ rereadAccessToken: async () => 'access-2', refresh });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: authority });
    await expect(decline('call-1')).resolves.toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('401, перечитанный токен тот же — идёт в сетевой refresh()', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer access-1') return jsonResponse(401);
      expect(auth).toBe('Bearer access-3');
      return jsonResponse(200);
    });
    const authority = fakeAuthority({
      rereadAccessToken: async () => 'access-1',
      refresh: async () => ({ kind: 'refreshed', accessToken: 'access-3' }),
    });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: authority });
    await expect(decline('call-1')).resolves.toBe(true);
    expect(calls).toBe(2);
  });

  it('refresh() отверг сессию (rejected) — false, не бросает', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(401));
    const authority = fakeAuthority({
      rereadAccessToken: async () => 'access-1',
      refresh: async () => ({ kind: 'rejected' }),
    });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: authority });
    await expect(decline('call-1')).resolves.toBe(false);
  });

  it('refresh() unavailable (сеть/5xx) — false, не бросает, не повторяет запрос (feedback-003, п.4)', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(401));
    const refresh = jest.fn(async () => ({ kind: 'unavailable' }) as const);
    const authority = fakeAuthority({ rereadAccessToken: async () => 'access-1', refresh });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: authority });
    await expect(decline('call-1')).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Только исходный запрос — тем же протухшим токеном не повторяли.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('звонок уже закрыт на сервере (404) — false, не бросает', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(404));
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: fakeAuthority() });
    await expect(decline('call-1')).resolves.toBe(false);
  });

  it('сеть упала — false, не бросает', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    });
    const decline = createBackgroundDecline({ fetchImpl, tokenAuthority: fakeAuthority() });
    await expect(decline('call-1')).resolves.toBe(false);
  });
});
