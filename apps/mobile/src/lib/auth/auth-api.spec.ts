import { AuthRequestError, createAuthApi, isAppTokens } from './auth-api';

const TOKENS = { accessToken: 'a', refreshToken: 'r', expiresIn: 900, refreshExpiresIn: 2592000 };

function reply(status: number, body: unknown) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('createAuthApi', () => {
  it('меняет код на токены по нужному адресу', async () => {
    const fetchImpl = reply(200, TOKENS);
    const api = createAuthApi('http://localhost:4000/', fetchImpl);
    await expect(api.exchangeCode('code', 'verifier')).resolves.toEqual(TOKENS);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/auth/app/token');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'code', codeVerifier: 'verifier' });
  });

  it('передаёт текст отказа сервера', async () => {
    const api = createAuthApi('https://api', reply(401, { message: 'Код входа недействителен' }));
    await expect(api.exchangeCode('c', 'v')).rejects.toMatchObject({
      status: 401,
      message: 'Код входа недействителен',
    });
  });

  it('обрыв сети превращает в понятную ошибку со статусом 0', async () => {
    const api = createAuthApi('https://api', jest.fn(async () => {
      throw new TypeError('Network request failed');
    }));
    await expect(api.refresh('r')).rejects.toEqual(new AuthRequestError(0, 'Нет связи с сервером. Проверьте интернет.'));
  });

  it('не принимает ответ без токенов за успех', async () => {
    const api = createAuthApi('https://api', reply(200, { ok: true }));
    await expect(api.refresh('r')).rejects.toMatchObject({ status: 502 });
  });
});

describe('isAppTokens', () => {
  it('требует непустые строки и числовые сроки', () => {
    expect(isAppTokens(TOKENS)).toBe(true);
    expect(isAppTokens({ ...TOKENS, accessToken: '' })).toBe(false);
    expect(isAppTokens({ ...TOKENS, expiresIn: '900' })).toBe(false);
    expect(isAppTokens(null)).toBe(false);
  });
});
