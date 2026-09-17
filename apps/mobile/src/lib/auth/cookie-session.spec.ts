import { buildWebLoginUrl, createCookieAuthApi } from './cookie-session';

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('buildWebLoginUrl', () => {
  it('ведёт на вход провайдера с возвратом на свой адрес', () => {
    const url = new URL(
      buildWebLoginUrl('https://api.vedamatch.com/', 'google', 'https://ios.vedamatch.com', '/chat/c1'),
    );
    expect(`${url.origin}${url.pathname}`).toBe('https://api.vedamatch.com/auth/google');
    expect(url.searchParams.get('returnOrigin')).toBe('https://ios.vedamatch.com');
    expect(url.searchParams.get('returnTo')).toBe('/chat/c1');
    // Это вход сайта, а не приложения: никаких app_redirect/PKCE.
    expect(url.searchParams.has('app_redirect')).toBe(false);
  });

  it('путь возврата не из приложения превращается в корень', () => {
    const url = new URL(buildWebLoginUrl('https://api', 'yandex', 'https://ios', '//evil.example'));
    expect(url.searchParams.get('returnTo')).toBe('/');
    expect(new URL(buildWebLoginUrl('https://api', 'yandex', 'https://ios', 'https://x')).searchParams.get('returnTo')).toBe('/');
  });
});

describe('createCookieAuthApi', () => {
  it('refresh ходит с cookie на /auth/refresh', async () => {
    const fetchImpl = jest.fn(async () => response(201, { ok: true }));
    const api = createCookieAuthApi('https://api/', fetchImpl);

    await expect(api.refresh()).resolves.toEqual({ kind: 'refreshed', accessToken: '' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api/auth/refresh');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('401 и 403 — сессии нет', async () => {
    await expect(createCookieAuthApi('https://api', async () => response(401)).refresh()).resolves.toEqual({
      kind: 'rejected',
    });
    await expect(createCookieAuthApi('https://api', async () => response(403)).refresh()).resolves.toEqual({
      kind: 'rejected',
    });
  });

  it('сеть и 5xx — сессия жива, просто сейчас не вышло', async () => {
    const offline = createCookieAuthApi('https://api', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.refresh()).resolves.toEqual({ kind: 'unavailable' });
    await expect(createCookieAuthApi('https://api', async () => response(502)).refresh()).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('одновременные refresh делят один запрос', async () => {
    let release: () => void = () => undefined;
    const fetchImpl = jest.fn(
      () => new Promise<Response>((resolve) => (release = () => resolve(response(201)))),
    );
    const api = createCookieAuthApi('https://api', fetchImpl);

    const both = Promise.all([api.refresh(), api.refresh()]);
    release();
    await both;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('logout не бросает без сети', async () => {
    const api = createCookieAuthApi('https://api', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('devLogin отправляет почту и пароль и ждёт cookie', async () => {
    const fetchImpl = jest.fn(async () => response(201, { ok: true }));
    const api = createCookieAuthApi('https://api', fetchImpl);

    await api.devLogin('a@b', 'pw');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api/auth/dev-login');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b', password: 'pw' });
  });

  it('devLogin с отказом бросает текст сервера', async () => {
    const api = createCookieAuthApi('https://api', async () => response(401, { message: 'Неверный пароль' }));
    await expect(api.devLogin('a@b', 'x')).rejects.toThrow('Неверный пароль');
  });
});
