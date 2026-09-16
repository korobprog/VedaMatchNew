import type { AppTokens } from './auth-api';
import { createTokenAuthority } from './token-authority';

const store = {
  tokens: null as { accessToken: string; refreshToken: string } | null,
};

jest.mock('@/config/app-variant', () => ({
  appVariant: () => ({ apiOrigin: 'https://api.example', contour: 'ru', channel: 'site' }),
}));

jest.mock('./token-store', () => ({
  readTokens: async () => store.tokens,
  writeTokens: async (pair: { accessToken: string; refreshToken: string }) => {
    store.tokens = pair;
  },
  clearTokens: async () => {
    store.tokens = null;
  },
}));

function fakeAuthApi(refresh: (refreshToken: string) => Promise<AppTokens>) {
  return {
    exchangeCode: jest.fn(),
    refresh: jest.fn(refresh),
    devLogin: jest.fn(),
    logout: jest.fn(),
  };
}

describe('createTokenAuthority', () => {
  beforeEach(() => {
    store.tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };
  });

  it('hydrate() читает SecureStore один раз и кэширует', async () => {
    const authApi = fakeAuthApi(async () => {
      throw new Error('не должен звать сеть');
    });
    const authority = createTokenAuthority({ authApi });
    await expect(authority.hydrate()).resolves.toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(authority.peekAccessToken()).toBe('access-1');
  });

  it('refresh(): читает свежую пару из SecureStore, обменивает, пишет обратно', async () => {
    const authApi = fakeAuthApi(async (refreshToken) => {
      expect(refreshToken).toBe('refresh-1');
      return { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900, refreshExpiresIn: 2_592_000 };
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBe('access-2');
    expect(store.tokens).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(authority.peekAccessToken()).toBe('access-2');
  });

  it('два параллельных refresh() — один сетевой обмен', async () => {
    let calls = 0;
    const authApi = fakeAuthApi(async (refreshToken) => {
      calls += 1;
      expect(refreshToken).toBe('refresh-1');
      return { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900, refreshExpiresIn: 2_592_000 };
    });
    const authority = createTokenAuthority({ authApi });

    const [a, b] = await Promise.all([authority.refresh(), authority.refresh()]);
    expect(a).toBe('access-2');
    expect(b).toBe('access-2');
    expect(calls).toBe(1);
  });

  it('access, обновлённый другим участником, подхватывается без refresh', async () => {
    // Симулирует headless-отклонение и живой SessionProvider в одном
    // процессе (VED-221, feedback-001.md, п.1): первый уже обновил пару "за
    // спиной" второго прямо в SecureStore, второй ещё не знает об этом.
    const authApi = fakeAuthApi(async () => {
      throw new Error('не должен звать сеть — пара уже свежая');
    });
    const authority = createTokenAuthority({ authApi });
    await authority.hydrate(); // authority думает, что access-1 — актуальный
    expect(authority.peekAccessToken()).toBe('access-1');

    // "Другой участник" пишет новую пару прямо в SecureStore, минуя эту authority.
    store.tokens = { accessToken: 'access-9', refreshToken: 'refresh-9' };

    await expect(authority.rereadAccessToken()).resolves.toBe('access-9');
    expect(authority.peekAccessToken()).toBe('access-9');
    expect(authApi.refresh).not.toHaveBeenCalled();
  });

  it('refresh() тоже перечитывает свежую пару, а не доверяет устаревшему кэшу', async () => {
    const authApi = fakeAuthApi(async (refreshToken) => {
      expect(refreshToken).toBe('refresh-9');
      return { accessToken: 'access-10', refreshToken: 'refresh-10', expiresIn: 900, refreshExpiresIn: 2_592_000 };
    });
    const authority = createTokenAuthority({ authApi });
    await authority.hydrate();

    store.tokens = { accessToken: 'access-9', refreshToken: 'refresh-9' };

    await expect(authority.refresh()).resolves.toBe('access-10');
  });

  it('refresh отказал (сессия истекла), но SecureStore уже обновился другим путём — не роняет сессию', async () => {
    const authApi = fakeAuthApi(async () => {
      // "Другой участник" успевает обновиться первым и подменить SecureStore
      // прямо во время сетевого ожидания этого вызова.
      store.tokens = { accessToken: 'access-fresh', refreshToken: 'refresh-fresh' };
      throw Object.assign(new Error('revoked'), { status: 401 });
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBe('access-fresh');
    expect(store.tokens).toEqual({ accessToken: 'access-fresh', refreshToken: 'refresh-fresh' });
  });

  it('refresh отказал и SecureStore не менялся — сессия действительно закончилась', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('revoked'), { status: 401 });
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBeNull();
    expect(store.tokens).toBeNull();
    expect(authority.peekAccessToken()).toBeNull();
  });

  it('403 от сервера — тоже явный отказ, стирает сессию (симметрично 401)', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBeNull();
    expect(store.tokens).toBeNull();
  });

  it('5xx от сервера — временная недоступность, не разлогин (feedback-002, важное п.2 / подозрение на VED-234)', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('bad gateway'), { status: 502 });
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBe('access-1');
    expect(store.tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(authority.peekAccessToken()).toBe('access-1');
  });

  it('статус ответа неизвестен/не проставлен — тоже не разлогин, только явные 401/403 стирают', async () => {
    const authApi = fakeAuthApi(async () => {
      throw new Error('что-то пошло не так, без status');
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBe('access-1');
    expect(store.tokens).not.toBeNull();
  });

  it('сеть недоступна — токены не стираются, отдаётся то, что было', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('offline'), { status: 0 });
    });
    const authority = createTokenAuthority({ authApi });

    await expect(authority.refresh()).resolves.toBe('access-1');
    expect(store.tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('adopt()/drop() будят подписчиков', async () => {
    const authApi = fakeAuthApi(async () => {
      throw new Error('не используется в этом тесте');
    });
    const authority = createTokenAuthority({ authApi });
    const seen: ({ accessToken: string; refreshToken: string } | null)[] = [];
    authority.subscribe((tokens) => seen.push(tokens));

    await authority.adopt({ accessToken: 'a', refreshToken: 'r' });
    await authority.drop();

    expect(seen).toEqual([{ accessToken: 'a', refreshToken: 'r' }, null]);
    expect(authority.peekAccessToken()).toBeNull();
  });

  it('нет токенов в хранилище вовсе — getAccessToken() отдаёт null, не падает', async () => {
    store.tokens = null;
    const authApi = fakeAuthApi(async () => {
      throw new Error('не должен звать сеть');
    });
    const authority = createTokenAuthority({ authApi });
    await expect(authority.getAccessToken()).resolves.toBeNull();
  });
});
