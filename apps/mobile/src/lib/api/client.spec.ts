import { ApiError, createApiClient, type SessionPort } from './client';

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status });
}

function sessionWith(initial: string | null, refreshed: string | null) {
  let current = initial;
  const refresh = jest.fn(async () => {
    current = refreshed;
    return refreshed;
  });
  const session: SessionPort = { getAccessToken: async () => current, refresh };
  return { session, refresh };
}

describe('createApiClient', () => {
  it('ставит Bearer и склеивает адрес без двойного слэша', async () => {
    const fetchImpl = jest.fn(async () => json(200, { ok: true }));
    const { session } = sessionWith('access-1', null);
    const api = createApiClient({ baseUrl: 'https://api.vedamatch.ru/', session, fetchImpl });

    await expect(api.request('/chat/conversations')).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.vedamatch.ru/chat/conversations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('без токена не шлёт Authorization и не пытается обновиться на 401, но сообщает о конце сессии', async () => {
    // Токена нет вовсе (не «протух», а отсутствует) — обновляться нечем, но
    // молчать тоже нельзя: раньше `response.status === 401 && token` было
    // ложно при отсутствующем токене, и `onSessionExpired` не звался вовсе
    // — приложение оставалось в «вошёл», хотя сервер уже сказал обратное
    // (`gan-harness/feedback/feedback-002.md`, блокирующий п.1).
    const fetchImpl = jest.fn(async () => json(401, { message: 'Unauthorized' }));
    const { session, refresh } = sessionWith(null, 'never');
    const onSessionExpired = jest.fn();
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl, onSessionExpired });

    await expect(api.request('/me')).rejects.toMatchObject({ status: 401 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('на 401 обновляет токен и повторяет запрос один раз', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { id: 'c1' }));
    const { session, refresh } = sessionWith('old', 'new');
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl });

    await expect(api.request('/chat/c1')).resolves.toEqual({ id: 'c1' });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [, retry] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect((retry.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('одновременные 401 делят одно обновление', async () => {
    let release: (value: string) => void = () => undefined;
    const refresh = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const session: SessionPort = { getAccessToken: async () => 'old', refresh };
    const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer fresh' ? json(200, { ok: 1 }) : json(401, {});
    });
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl });

    const pending = Promise.all([api.request('/a'), api.request('/b'), api.request('/c')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release('fresh');

    await expect(pending).resolves.toHaveLength(3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('сообщает о конце сессии, если обновиться не вышло', async () => {
    const fetchImpl = jest.fn(async () => json(401, { message: 'Unauthorized' }));
    const { session } = sessionWith('old', null);
    const onSessionExpired = jest.fn();
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl, onSessionExpired });

    await expect(api.request('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('отдаёт сообщение NestJS, в том числе массив от валидации', async () => {
    const { session } = sessionWith('t', null);
    const one = createApiClient({
      baseUrl: 'https://api',
      session,
      fetchImpl: async () => json(403, { message: 'Нет доступа к беседе' }),
    });
    await expect(one.request('/x')).rejects.toThrow('Нет доступа к беседе');

    const many = createApiClient({
      baseUrl: 'https://api',
      session,
      fetchImpl: async () => json(400, { message: ['text пустой', 'text длиннее 4000'] }),
    });
    await expect(many.request('/x')).rejects.toThrow('text пустой; text длиннее 4000');
  });

  it('сериализует тело и ставит Content-Type только когда тело есть', async () => {
    const fetchImpl = jest.fn(async () => json(201, { id: 'm1' }));
    const { session } = sessionWith('t', null);
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl });

    await api.request('/chat/c1/messages', { method: 'POST', body: { text: 'Харе Кришна' } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ text: 'Харе Кришна' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('FormData не сериализуется и не получает ручной Content-Type', async () => {
    const fetchImpl = jest.fn(async () => json(201, { key: 'chat/x/1' }));
    const { session } = sessionWith('t', null);
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl });

    const form = new FormData();
    form.append('file', { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);

    await api.request('/chat/conversations/c1/uploads', { method: 'POST', body: form });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('пустой ответ 204 возвращает null', async () => {
    const { session } = sessionWith('t', null);
    const api = createApiClient({ baseUrl: 'https://api', session, fetchImpl: async () => new Response(null, { status: 204 }) });
    await expect(api.request('/chat/c1/read', { method: 'POST' })).resolves.toBeNull();
  });
});
